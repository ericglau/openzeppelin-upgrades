import type {  HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract } from 'ethers';

import {
  Manifest,
  fetchOrDeployAdmin,
  logWarning,
  ProxyDeployment,
  BeaconProxyUnsupportedError,
  getImplementationAddress,
  getImplementationAddressFromProxy,
  implLens,
  getCode,
  getVersion,
  EthereumProvider,
} from '@openzeppelin/upgrades-core';

import {
  DeployProxyOptions,
  deploy,
  getProxyFactory,
  getTransparentUpgradeableProxyFactory,
  getProxyAdminFactory,
  DeployTransaction,
  deployProxyImpl,
  getInitializerData,
  getDeployData,
  getBeaconProxyFactory,
} from './utils';
import { FormatTypes } from 'ethers/lib/utils';

export interface ImportProxyFunction {
  (proxyAddress: string, ImplFactory: ContractFactory, opts?: DeployProxyOptions): Promise<Contract>;
}

function isProbableMatch(creationCode: string, deployedBytecode: string) {
  const creationCodeWithoutPrefix = creationCode.replace(/^0x/, '');
  const deployedBytecodeWithoutPrefix = deployedBytecode.replace(/^0x/, '');
  return creationCodeWithoutPrefix.includes(deployedBytecodeWithoutPrefix);
}

export function makeImportProxy(hre: HardhatRuntimeEnvironment): ImportProxyFunction {
  return async function importProxy(
    proxyAddress: string,
    ImplFactory: ContractFactory,
    opts: DeployProxyOptions = {},
  ) {
    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

    const impl = await getImplementationAddressFromProxy(provider, proxyAddress);
    console.log("FOUND IMPL ADDRESS " + impl + " FOR PROXY " + proxyAddress);
    if (!!!impl) {
      throw new Error("address does not look like proxy"); // TODO cleanup
    }



    // from deploy-impl
    const { deployTx, deployData } = await getDeploymentFromImpl(hre, ImplFactory, opts, impl);



    // get proxy type from bytecode
    let kind : ProxyDeployment["kind"];
    if (await isBytecodeMatch(provider, proxyAddress, await getProxyFactory(hre, ImplFactory.signer))) {
      kind = 'uups';
    } else if (await isBytecodeMatch(provider, proxyAddress, await getTransparentUpgradeableProxyFactory(hre, ImplFactory.signer))) {
      kind = 'transparent';
    } else if (await isBytecodeMatch(provider, proxyAddress, await getBeaconProxyFactory(hre, ImplFactory.signer))) {
      kind = 'beacon';
    } else {
      throw new Error("cannot determine proxy type"); // TODO let user specify it
    }
    console.log("determined kind " + kind);


    const proxyToImport: ProxyDeployment = { kind: kind , address: proxyAddress };
    


    await checkBytecodeMatch(provider, impl, ImplFactory);
    await updateManifest();
    return ImplFactory.attach(proxyAddress);



    async function updateManifest() {
      await manifest.addProxy(proxyToImport);
      const lens = implLens(deployData.version.linkedWithoutMetadata);
      await manifest.lockedRun(async () => {
        const data = await manifest.read();
        const deployment = lens(data);
        const stored = deployment.get();
        const updated = await deployTx(); //await resumeOrDeploy(provider, stored, deploy);

        if (updated !== stored) {
          //await checkForAddressClash(provider, data, updated); // TODO not sure if we need this
          // TODO if there is an existing impl version at different address, we should use that one (?)
          deployment.set(updated);
          await manifest.write(data);
        }
        return updated;
      });
    }
    // TODO write impl to manifest
    // TODO the below is from impl-store.ts
    // try {
    //   const deployment = await manifest.lockedRun(async () => {
    //     debug('fetching deployment of', lens.description);
    //     const data = await manifest.read();
    //     const deployment = lens(data);
    //     const stored = deployment.get();
    //     if (stored === undefined) {
    //       debug('deployment of', lens.description, 'not found');
    //     }
    //     const updated = await resumeOrDeploy(provider, stored, deploy);
    //     if (updated !== stored) {
    //       await checkForAddressClash(provider, data, updated);
    //       deployment.set(updated);
    //       await manifest.write(data);
    //     }
    //     return updated;
    //   });





    // const { impl, kind } = await deployProxyImpl(hre, ImplFactory, opts);
    // const contractInterface = ImplFactory.interface;
    // const data = getInitializerData(contractInterface, args, opts.initializer);

    // if (kind === 'uups') {
    //   if (await manifest.getAdmin()) {
    //     logWarning(`A proxy admin was previously deployed on this network`, [
    //       `This is not natively used with the current kind of proxy ('uups').`,
    //       `Changes to the admin will have no effect on this new proxy.`,
    //     ]);
    //   }
    // }

    // let proxyDeployment: Required<ProxyDeployment & DeployTransaction>;
    // switch (kind) {
    //   case 'beacon': {
    //     throw new BeaconProxyUnsupportedError();
    //   }

    //   case 'uups': {
    //     const ProxyFactory = await getProxyFactory(hre, ImplFactory.signer);
    //     proxyDeployment = Object.assign({ kind }, await deploy(ProxyFactory, impl, data));
    //     break;
    //   }

    //   case 'transparent': {
    //     const AdminFactory = await getProxyAdminFactory(hre, ImplFactory.signer);
    //     const adminAddress = await fetchOrDeployAdmin(provider, () => deploy(AdminFactory));
    //     const TransparentUpgradeableProxyFactory = await getTransparentUpgradeableProxyFactory(hre, ImplFactory.signer);
    //     proxyDeployment = Object.assign(
    //       { kind },
    //       await deploy(TransparentUpgradeableProxyFactory, impl, adminAddress, data),
    //     );
    //     break;
    //   }
    // }

    //TODO
    //await manifest.addProxy(proxyDeployment);

    //const inst = ImplFactory.attach(proxyDeployment.address);
    // @ts-ignore Won't be readonly because inst was created through attach.
    //inst.deployTransaction = proxyDeployment.deployTransaction;
    //return inst;
  };
}

async function checkBytecodeMatch(provider: EthereumProvider, impl: string, ImplFactory: ContractFactory) {
  const probableMatch = await isBytecodeMatch(provider, impl, ImplFactory);
  if (!probableMatch) {
    throw new Error("Contract does not match with implementation bytecode deployed at " + impl);
  }
}

async function isBytecodeMatch(provider: EthereumProvider, addr: string, Factory: ContractFactory) {
  const implBytecode = await getCode(provider, addr);
  //console.log("factory bytecode " + Factory.bytecode);
  //console.log("addr bytecode " + implBytecode);

  const probableMatch = isProbableMatch(Factory.bytecode, implBytecode);
  return probableMatch;
}

async function getDeploymentFromImpl(hre: HardhatRuntimeEnvironment, ImplFactory: ContractFactory, opts: DeployProxyOptions, impl: string) {
  const deployData = await getDeployData(hre, ImplFactory, opts); // TODO move this stuff to deploy-impl so this function doesn't need to be exported
  const layout = deployData.layout;
  const deployTx = async () => {
    const abi = ImplFactory.interface.format(FormatTypes.minimal) as string[];
    const deployment = Object.assign({ abi }); //, await deploy(ImplFactory /* no contructor args //, ...deployData.fullOpts.constructorArgs*/));
    return { ...deployment, layout, address: impl }; // TODO check where we should actually put this address part
  };
  return { deployTx, deployData };
}

