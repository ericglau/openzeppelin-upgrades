import type {  HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract } from 'ethers';

import {
  Manifest,
  logWarning,
  ProxyDeployment,
  getImplementationAddressFromProxy,
  getCode,
  EthereumProvider,
  UpgradesError,
  getAdminAddress,
} from '@openzeppelin/upgrades-core';

import {
  ImportProxyOptions,
  getProxyFactory,
  getTransparentUpgradeableProxyFactory,
  getBeaconProxyFactory,
  simulateDeployImpl,
} from './utils';
import { simulateDeployAdmin } from './utils/simulate-deploy';

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


    // add impl to manifest
    const implMatch = await isBytecodeMatch(provider, implAddress, Factory);
    if (!implMatch) {
      throw new Error("Contract does not match with implementation bytecode deployed at " + implAddress);
    }
    await simulateDeployImpl(hre, Factory, opts, implAddress);

    // add admin to manifest
    if (kind === 'transparent') {
      const adminAddress = await getAdminAddress(provider, proxyAddress);
      await simulateDeployAdmin(hre, Factory, opts, adminAddress);
    }

    // add proxy to manifest
    const proxyToImport: ProxyDeployment = { kind: kind , address: proxyAddress };
    await manifest.addProxy(proxyToImport);

    if (kind === 'uups') {
      if (await manifest.getAdmin()) {
        logWarning(`A proxy admin was previously deployed on this network`, [
          `This is not natively used with the current kind of proxy ('uups').`,
          `Changes to the admin will have no effect on this new proxy.`,
        ]);
      }
    }

    return Factory.attach(proxyAddress);
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
