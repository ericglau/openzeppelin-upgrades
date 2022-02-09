import {
  Manifest,
  logWarning,
  ProxyDeployment,
  getImplementationAddressFromProxy,
  UpgradesError,
  EthereumProvider,
  detectProxyKindFromBytecode,
  getCode,
  compareBytecode,
  getAdminAddress,
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
} from './utils';
import { simulateDeployAdmin, simulateDeployImpl } from './utils/simulate-deploy';

export async function importProxy(proxyAddress: string, Contract: ContractClass, opts: ImportProxyOptions = {}): Promise<ContractInstance> {
  const { deployer } = withDefaults(opts);
  const provider = wrapProvider(deployer.provider);
  const manifest = await Manifest.forNetwork(provider);


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

async function addImplToManifest(provider: EthereumProvider, implAddress: string, Contract: ContractClass, opts: ImportProxyOptions) {
  const runtimeBytecode = await getCode(provider, implAddress);
  const implMatch = await compareBytecode(Contract.bytecode, runtimeBytecode);
  if (!implMatch && !opts.force) {
    throw new UpgradesError("Contract does not match with implementation bytecode deployed at " + implAddress, 
      () => "The provided contract factory does not match with the bytecode deployed at the implementation address. If you are sure that you are using the correct implementation contract, force the import with the option { force: true }"
    )
  }
  await simulateDeployImpl(Contract, opts, implAddress, runtimeBytecode);
}

async function addAdminToManifest(provider: EthereumProvider, proxyAddress: string, Contract: ContractClass, opts: ImportProxyOptions) {
  const adminAddress = await getAdminAddress(provider, proxyAddress);
  const adminBytecode = await getCode(provider, adminAddress);
  // don't need to compare the admin contract's bytecode with creation code since it could be a custom admin, but store it to manifest in case it is used with the wrong network later on
  await simulateDeployAdmin(Contract, opts, adminAddress, adminBytecode);
}

async function addProxyToManifest(kind: ProxyDeployment['kind'], proxyAddress: string, manifest: Manifest) {
  const proxyToImport: ProxyDeployment = { kind: kind, address: proxyAddress };
  await manifest.addProxy(proxyToImport);

  if (kind === 'uups') {
    if (await manifest.getAdmin()) {
      logWarning(`A proxy admin was previously deployed on this network`, [
        `This is not natively used with the current kind of proxy ('uups').`,
        `Changes to the admin will have no effect on this new proxy.`,
      ]);
    }
  }
}

async function detectProxyKind(provider: EthereumProvider, proxyAddress: string, Contract: ContractClass, opts: ImportProxyOptions) {
  const UUPSProxy = getProxyFactory(Contract).bytecode;
  const TransparentProxy = getTransparentUpgradeableProxyFactory(Contract).bytecode;
  const BeaconProxy = getBeaconProxyFactory(Contract).bytecode;

  return await detectProxyKindFromBytecode(provider, proxyAddress, { UUPSProxy, TransparentProxy, BeaconProxy }, opts.kind);
}
