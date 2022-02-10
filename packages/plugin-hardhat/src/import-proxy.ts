import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract } from 'ethers';

import {
  Manifest,
  getImplementationAddressFromProxy,
  EthereumProvider,
  UpgradesError,
  getAdminAddress,
  detectProxyKindFromBytecode,
  getCode,
  getAndCompareImplBytecode,
  addProxyToManifest,
} from '@openzeppelin/upgrades-core';

import {
  ImportProxyOptions,
  getProxyFactory,
  getTransparentUpgradeableProxyFactory,
  getBeaconProxyFactory,
  simulateDeployImpl,
  ContractAddressOrInstance,
  getContractAddress,
} from './utils';
import { simulateDeployAdmin } from './utils/simulate-deploy';

export interface ImportProxyFunction {
  (proxyAddress: string, ImplFactory: ContractFactory, opts?: ImportProxyOptions): Promise<Contract>;
}

export function makeImportProxy(hre: HardhatRuntimeEnvironment): ImportProxyFunction {
  return async function importProxy(
    proxy: ContractAddressOrInstance,
    ImplFactory: ContractFactory,
    opts: ImportProxyOptions = {},
  ) {
    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

    const proxyAddress = getContractAddress(proxy);

    const implAddress = await getImplementationAddressFromProxy(provider, proxyAddress);
    if (implAddress === undefined) {
      throw new UpgradesError(
        `Contract at ${proxyAddress} doesn't look like a supported UUPS/Transparent/Beacon proxy`,
      );
    }

    const importKind = await detectProxyKind(provider, hre, proxyAddress, ImplFactory, opts);

    await addImplToManifest(provider, hre, implAddress, ImplFactory, opts);
    if (importKind === 'transparent') {
      await addAdminToManifest(provider, hre, proxyAddress, ImplFactory, opts);
    }
    await addProxyToManifest(importKind, proxyAddress, manifest);

    return ImplFactory.attach(proxyAddress);
  };
}

async function addImplToManifest(
  provider: EthereumProvider,
  hre: HardhatRuntimeEnvironment,
  implAddress: string,
  ImplFactory: ContractFactory,
  opts: ImportProxyOptions,
) {
  const runtimeBytecode = await getAndCompareImplBytecode(provider, implAddress, ImplFactory.bytecode, opts.force);
  await simulateDeployImpl(hre, ImplFactory, opts, implAddress, runtimeBytecode);
}

async function addAdminToManifest(
  provider: EthereumProvider,
  hre: HardhatRuntimeEnvironment,
  proxyAddress: string,
  ImplFactory: ContractFactory,
  opts: ImportProxyOptions,
) {
  const adminAddress = await getAdminAddress(provider, proxyAddress);
  const adminBytecode = await getCode(provider, adminAddress);
  // don't need to compare the admin contract's bytecode with creation code since it could be a custom admin, but store it to manifest in case it is used with the wrong network later on
  await simulateDeployAdmin(hre, ImplFactory, opts, adminAddress, adminBytecode);
}

async function detectProxyKind(
  provider: EthereumProvider,
  hre: HardhatRuntimeEnvironment,
  proxyAddress: string,
  ImplFactory: ContractFactory,
  opts: ImportProxyOptions,
) {
  const UUPSProxy = (await getProxyFactory(hre, ImplFactory.signer)).bytecode;
  const TransparentProxy = (await getTransparentUpgradeableProxyFactory(hre, ImplFactory.signer)).bytecode;
  const BeaconProxy = (await getBeaconProxyFactory(hre, ImplFactory.signer)).bytecode;

  return await detectProxyKindFromBytecode(
    provider,
    proxyAddress,
    { UUPSProxy, TransparentProxy, BeaconProxy },
    opts.kind,
  );
}
