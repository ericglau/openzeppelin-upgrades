import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract } from 'ethers';

import {
  Manifest,
  logWarning,
  ProxyDeployment,
  getImplementationAddressFromProxy,
  EthereumProvider,
  UpgradesError,
  getAdminAddress,
  compareBytecode,
  detectProxyKindFromBytecode,
  getCode,
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
    // TODO use ContractAddressOrInstance?
    proxyAddress: string,
    ImplFactory: ContractFactory,
    opts: ImportProxyOptions = {},
  ) {
    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

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
  const runtimeBytecode = await getCode(provider, implAddress);
  const implMatch = await compareBytecode(ImplFactory.bytecode, runtimeBytecode);
  if (!implMatch && !opts.force) {
    throw new UpgradesError(
      'Contract does not match with implementation bytecode deployed at ' + implAddress,
      () =>
        'The provided contract factory does not match with the bytecode deployed at the implementation address. If you are sure that you are using the correct implementation contract, force the import with the option { force: true }',
    );
  }
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
