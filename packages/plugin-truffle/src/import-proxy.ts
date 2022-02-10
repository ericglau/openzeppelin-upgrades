import {
  Manifest,
  getImplementationAddressFromProxy,
  UpgradesError,
  EthereumProvider,
  detectProxyKindFromBytecode,
  getCode,
  getAdminAddress,
  getAndCompareImplBytecode,
  addProxyToManifest,
} from '@openzeppelin/upgrades-core';

import {
  ContractClass,
  ContractInstance,
  wrapProvider,
  getProxyFactory,
  getTransparentUpgradeableProxyFactory,
  withDefaults,
  getBeaconProxyFactory,
  ImportProxyOptions,
  ContractAddressOrInstance,
  getContractAddress,
} from './utils';
import { simulateDeployAdmin, simulateDeployImpl } from './utils/simulate-deploy';

export async function importProxy(
  proxy: ContractAddressOrInstance,
  Contract: ContractClass,
  opts: ImportProxyOptions = {},
): Promise<ContractInstance> {
  const { deployer } = withDefaults(opts);
  const provider = wrapProvider(deployer.provider);
  const manifest = await Manifest.forNetwork(provider);

  const proxyAddress = getContractAddress(proxy);

  const implAddress = await getImplementationAddressFromProxy(provider, proxyAddress);
  if (implAddress === undefined) {
    throw new UpgradesError(`Contract at ${proxyAddress} doesn't look like a supported UUPS/Transparent/Beacon proxy`);
  }

  const importKind = await detectProxyKind(provider, proxyAddress, Contract, opts);

  await addImplToManifest(provider, implAddress, Contract, opts);
  if (importKind === 'transparent') {
    await addAdminToManifest(provider, proxyAddress, Contract, opts);
  }
  await addProxyToManifest(importKind, proxyAddress, manifest);

  return Contract.at(proxyAddress);
}

async function addImplToManifest(
  provider: EthereumProvider,
  implAddress: string,
  Contract: ContractClass,
  opts: ImportProxyOptions,
) {
  const runtimeBytecode = await getAndCompareImplBytecode(provider, implAddress, Contract.bytecode, opts.force);
  await simulateDeployImpl(Contract, opts, implAddress, runtimeBytecode);
}

async function addAdminToManifest(
  provider: EthereumProvider,
  proxyAddress: string,
  Contract: ContractClass,
  opts: ImportProxyOptions,
) {
  const adminAddress = await getAdminAddress(provider, proxyAddress);
  const adminBytecode = await getCode(provider, adminAddress);
  // don't need to compare the admin contract's bytecode with creation code since it could be a custom admin, but store it to manifest in case it is used with the wrong network later on
  await simulateDeployAdmin(Contract, opts, adminAddress, adminBytecode);
}

async function detectProxyKind(
  provider: EthereumProvider,
  proxyAddress: string,
  Contract: ContractClass,
  opts: ImportProxyOptions,
) {
  const UUPSProxy = getProxyFactory(Contract).bytecode;
  const TransparentProxy = getTransparentUpgradeableProxyFactory(Contract).bytecode;
  const BeaconProxy = getBeaconProxyFactory(Contract).bytecode;

  return await detectProxyKindFromBytecode(
    provider,
    proxyAddress,
    { UUPSProxy, TransparentProxy, BeaconProxy },
    opts.kind,
  );
}
