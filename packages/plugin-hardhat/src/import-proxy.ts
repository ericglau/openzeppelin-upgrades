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
    ImplFactory: ContractFactory,
    opts: ImportProxyOptions = {},
  ) {
    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

    const implAddress = await getImplementationAddressFromProxy(provider, proxyAddress);
    if (implAddress === undefined) {
      throw new UpgradesError(`Contract at ${proxyAddress} doesn't look like a supported UUPS/Transparent/Beacon proxy`);
    }

    // get proxy type from bytecode
    let kindDetected : ProxyDeployment["kind"];
    if (await isBytecodeMatch(provider, proxyAddress, await getProxyFactory(hre, ImplFactory.signer))) {
      kindDetected = 'uups';
    } else if (await isBytecodeMatch(provider, proxyAddress, await getTransparentUpgradeableProxyFactory(hre, ImplFactory.signer))) {
      kindDetected = 'transparent';
    } else if (await isBytecodeMatch(provider, proxyAddress, await getBeaconProxyFactory(hre, ImplFactory.signer))) {
      kindDetected = 'beacon';
    } else {
      if (opts.kind === undefined) {
        throw new UpgradesError(`Cannot determine the proxy kind at address ${proxyAddress}. Specify the 'kind' option for the importProxy function.`);
      } else {
        if (opts.kind !== 'uups' && opts.kind !== 'transparent' && opts.kind !== 'beacon') {
          throw new UpgradesError(`kind must be uups, transparent, or beacon`, () => `Specify a supported kind of proxy in the options for the importProxy function`);
        }
        kindDetected = opts.kind;
      }
    }

    if (opts.kind !== undefined && opts.kind !== kindDetected) {
      logWarning(`Detected proxy kind '${kindDetected}' at address ${proxyAddress} which differs from specified kind '${opts.kind}'`, [
        `The kind of proxy detected at the given address differs from the kind specified in the importProxy function's options.`,
        `The proxy will be imported as kind '${kindDetected}'.`,
      ]);
    }

    // add impl to manifest
    const implMatch = await isBytecodeMatch(provider, implAddress, ImplFactory);
    if (!implMatch) {
      throw new Error("Contract does not match with implementation bytecode deployed at " + implAddress);
    }
    await simulateDeployImpl(hre, ImplFactory, opts, implAddress);

    // add admin to manifest
    if (kindDetected === 'transparent') {
      const adminAddress = await getAdminAddress(provider, proxyAddress);
      await simulateDeployAdmin(hre, ImplFactory, opts, adminAddress);
    }

    // add proxy to manifest
    const proxyToImport: ProxyDeployment = { kind: kindDetected , address: proxyAddress };
    await manifest.addProxy(proxyToImport);

    if (kindDetected === 'uups') {
      if (await manifest.getAdmin()) {
        logWarning(`A proxy admin was previously deployed on this network`, [
          `This is not natively used with the current kind of proxy ('uups').`,
          `Changes to the admin will have no effect on this new proxy.`,
        ]);
      }
    }

    return ImplFactory.attach(proxyAddress);
  };
}

async function isBytecodeMatch(provider: EthereumProvider, addr: string, contractFactory: ContractFactory) {
  const implBytecode = await getCode(provider, addr);
  return compareBytecode(contractFactory.bytecode, implBytecode);
}

function compareBytecode(creationCode: string, deployedBytecode: string) {
  const creationCodeWithoutPrefix = creationCode.replace(/^0x/, '');
  const deployedBytecodeWithoutPrefix = deployedBytecode.replace(/^0x/, '');
  return creationCodeWithoutPrefix.includes(deployedBytecodeWithoutPrefix);
}