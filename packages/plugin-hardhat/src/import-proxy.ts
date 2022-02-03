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
  UpgradesError,
  getAdminAddress,
} from '@openzeppelin/upgrades-core';

import {
  ImportProxyOptions,
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
  (proxyAddress: string, ImplFactory: ContractFactory, opts?: ImportProxyOptions): Promise<Contract>;
}

export function makeImportProxy(hre: HardhatRuntimeEnvironment): ImportProxyFunction {
  return async function importProxy(
    proxyAddress: string,
    ImplFactory: ContractFactory,
    opts: ImportProxyOptions = {},
  ) {
    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

    const impl = await getImplementationAddressFromProxy(provider, proxyAddress);
    if (impl === undefined) {
      throw new UpgradesError(`Contract at ${proxyAddress} doesn't look like a supported UUPS/Transparent/Beacon proxy`);
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
      if (opts.kind !== undefined) {
        // TODO check if kind can be something else
        kind = opts.kind;
      }
      throw new UpgradesError(`Cannot determine proxy kind at contract address ${proxyAddress}. Specify the kind in the options for the importProxy function.`);
    }
    // TODO give error or warning if user provided kind is different from detected kind?
    console.log("determined kind " + kind);

    // TODO get proxy admin and add to manifes
    if (kind === 'transparent') {
      const admin = await getAdminAddress(provider, proxyAddress);
      //await fetchOrDeployAdmin(provider, () => deploy(AdminFactory), opts);
      // TODO add admin if not already one
    }

    const proxyToImport: ProxyDeployment = { kind: kind , address: proxyAddress };

    const implMatch = await isBytecodeMatch(provider, impl, ImplFactory);
    if (!implMatch) {
      throw new Error("Contract does not match with implementation bytecode deployed at " + impl);
    }
    await updateManifest();

    if (kind === 'uups') {
      if (await manifest.getAdmin()) {
        logWarning(`A proxy admin was previously deployed on this network`, [
          `This is not natively used with the current kind of proxy ('uups').`,
          `Changes to the admin will have no effect on this new proxy.`,
        ]);
      }
    }

    return ImplFactory.attach(proxyAddress);

    // TODO the below is from impl-store.ts
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
  };
}

function isProbableMatch(creationCode: string, deployedBytecode: string) {
  const creationCodeWithoutPrefix = creationCode.replace(/^0x/, '');
  const deployedBytecodeWithoutPrefix = deployedBytecode.replace(/^0x/, '');
  return creationCodeWithoutPrefix.includes(deployedBytecodeWithoutPrefix);
}

async function isBytecodeMatch(provider: EthereumProvider, addr: string, Factory: ContractFactory) {
  const implBytecode = await getCode(provider, addr);
  return isProbableMatch(Factory.bytecode, implBytecode);
}

async function getDeploymentFromImpl(hre: HardhatRuntimeEnvironment, ImplFactory: ContractFactory, opts: ImportProxyOptions, impl: string) {
  const deployData = await getDeployData(hre, ImplFactory, opts); // TODO move this stuff to deploy-impl so this function doesn't need to be exported
  const layout = deployData.layout;
  const deployTx = async () => {
    const abi = ImplFactory.interface.format(FormatTypes.minimal) as string[];
    const deployment = Object.assign({ abi }); //, await deploy(ImplFactory /* no contructor args //, ...deployData.fullOpts.constructorArgs*/));
    return { ...deployment, layout, address: impl }; // TODO check where we should actually put this address part
  };
  return { deployTx, deployData };
}

