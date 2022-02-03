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
  fetchOrDeploy,
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
    Factory: ContractFactory,
    opts: ImportProxyOptions = {},
  ) {
    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

    const implAddress = await getImplementationAddressFromProxy(provider, proxyAddress);
    if (implAddress === undefined) {
      throw new UpgradesError(`Contract at ${proxyAddress} doesn't look like a supported UUPS/Transparent/Beacon proxy`);
    }

    const deployData = await getDeployData(hre, Factory, opts); // TODO move this stuff to deploy-impl so this function doesn't need to be exported
    const layout = deployData.layout;

    // get proxy type from bytecode
    let kind : ProxyDeployment["kind"];
    if (await isBytecodeMatch(provider, proxyAddress, await getProxyFactory(hre, Factory.signer))) {
      kind = 'uups';
    } else if (await isBytecodeMatch(provider, proxyAddress, await getTransparentUpgradeableProxyFactory(hre, Factory.signer))) {
      kind = 'transparent';
    } else if (await isBytecodeMatch(provider, proxyAddress, await getBeaconProxyFactory(hre, Factory.signer))) {
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

      const simulateDeploy = await getSimulateDeployFunction(admin);
      const manifestAdminAddress = await fetchOrDeployAdmin(provider, simulateDeploy, opts);

      // TODO give warning if imported admin differs from manifest
      if (admin !== manifestAdminAddress) {
        throw new Error("admin address does not match manifest admin address"); // TODO change this to a warning
      }
    }

    const proxyToImport: ProxyDeployment = { kind: kind , address: proxyAddress };

    const implMatch = await isBytecodeMatch(provider, implAddress, Factory);
    if (!implMatch) {
      throw new Error("Contract does not match with implementation bytecode deployed at " + implAddress);
    }
    await updateManifest(implAddress);

    if (kind === 'uups') {
      if (await manifest.getAdmin()) {
        logWarning(`A proxy admin was previously deployed on this network`, [
          `This is not natively used with the current kind of proxy ('uups').`,
          `Changes to the admin will have no effect on this new proxy.`,
        ]);
      }
    }

    return Factory.attach(proxyAddress);

    // TODO the below is from impl-store.ts
    async function updateManifest(implAddress: string) {
      await manifest.addProxy(proxyToImport);

      // from deploy-impl
      const simulateDeploy = await getSimulateDeployFunction(implAddress);

      // simulate a deployment
      await fetchOrDeploy(
        deployData.version,
        deployData.provider,
        simulateDeploy,
      );
    }

    async function getSimulateDeployFunction(addr: string) {
      const simulateDeploy = async () => {
        const abi = Factory.interface.format(FormatTypes.minimal) as string[];
        const deployment = Object.assign({ abi }); //, await deploy(ImplFactory /* no contructor args //, ...deployData.fullOpts.constructorArgs*/));
        return { ...deployment, layout, address: addr }; // TODO check where we should actually put this address part
      };
      return simulateDeploy;
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
