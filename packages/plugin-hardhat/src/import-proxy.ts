import type { HardhatRuntimeEnvironment } from 'hardhat/types';
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
} from './utils';
import { FormatTypes } from 'ethers/lib/utils';

export interface ImportProxyFunction {
  (proxyAddress: string, ImplFactory: ContractFactory, opts?: DeployProxyOptions): Promise<Contract>;
}

function isProbableMatch(creationCode: string, deployedBytecode: string) {
  const creationCodeWithoutPrefix = creationCode.replace(/^0x/, '');
  const deployedBytecodeWithoutPrefix = deployedBytecode.replace(/^0x/, '');
  return creationCodeWithoutPrefix.endsWith(deployedBytecodeWithoutPrefix);
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
    const deployData = await getDeployData(hre, ImplFactory, opts); // TODO move this stuff to deploy-impl so this function doesn't need to be exported
    const layout = deployData.layout;
    const deployTx = async () => {
      const abi = ImplFactory.interface.format(FormatTypes.minimal) as string[];
      const deployment = Object.assign({ abi });//, await deploy(ImplFactory /* no contructor args //, ...deployData.fullOpts.constructorArgs*/));
      return { ...deployment, layout, address: impl }; // TODO check where we should actually put this address part
    }

    //const proxyDeployment: ProxyDeployment & DeployTransaction = { kind: 'uups', address: proxyAddress, /*, txHash: '0x'*/ deployTransaction: deployment };
    //const proxyDeployment: ProxyDeployment = { kind: 'uups', address: proxyAddress };
    const proxyDeployment: ProxyDeployment & DeployTransaction = { kind: 'uups', address: proxyAddress, deployTransaction: await deployTx() };
    



    // check if bytecode matches
    console.log("Input CF bytecode:\n" + ImplFactory.bytecode);
    // console.log("Input version withMetadata:\n" + deployData.version.withMetadata);
    // console.log("Input version withoutMetadata:\n" + deployData.version.withoutMetadata);
    // console.log("Input version linkedWithoutMetadata:\n" + deployData.version.linkedWithoutMetadata);

    const implBytecode = await getCode(provider, impl);
    console.log("Read deployed bytecode:\n" + implBytecode);

    const probableMatch = isProbableMatch(ImplFactory.bytecode, implBytecode);
    console.log("probable match?:\n" + probableMatch);

    if (!probableMatch) {
      throw new Error("Contract does not match with implementation bytecode deployed at " + impl);
    }

    // const deployedVersion = getVersion(implBytecode, deployData.encodedArgs);
    // console.log("Read deployed version withMetadata:\n" + deployedVersion.withMetadata);
    // console.log("Read deployed version withoutMetadata:\n" + deployedVersion.withoutMetadata);
    // console.log("Read deployed version linkedWithoutMetadata:\n" + deployedVersion.linkedWithoutMetadata);

    await manifest.addProxy(proxyDeployment);

    const lens = implLens(deployData.version.linkedWithoutMetadata);
    //try {
      const deployment1 = await manifest.lockedRun(async () => {
        const data = await manifest.read();
        const deployment = lens(data);
        const updated = await deployTx();//await resumeOrDeploy(provider, stored, deploy);
       // if (updated !== stored) {
          //await checkForAddressClash(provider, data, updated);
          deployment.set(updated);
          await manifest.write(data);
        //}
        return updated;
      });
      


    // basically return Greeter.attach(proxy.address);
    return ImplFactory.attach(proxyAddress);


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
