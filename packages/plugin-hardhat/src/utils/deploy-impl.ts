import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory } from 'ethers';

import {
  Manifest,
  assertUpgradeSafe,
  assertStorageUpgradeSafe,
  fetchOrDeploy,
  getImplementationAddress,
  getStorageLayout,
  getStorageLayoutForAddress,
  getUnlinkedBytecode,
  getVersion,
  inferProxyKind,
  setProxyKind,
  ValidationOptions,
  getBeaconAddress,
} from '@openzeppelin/upgrades-core';

import { deploy } from './deploy';
import { Options, withDefaults } from './options';
import { readValidations } from './validations';
import { getBeaconProxyFactory } from '.';

interface DeployedImpl {
  impl: string;
  kind: NonNullable<ValidationOptions['kind']>;
}

export async function deployImpl(
  hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
  proxyAddress?: string,
): Promise<DeployedImpl> {
  const { provider } = hre.network;
  const validations = await readValidations(hre);
  const unlinkedBytecode = getUnlinkedBytecode(validations, ImplFactory.bytecode);
  const encodedArgs = ImplFactory.interface.encodeDeploy(opts.constructorArgs);
  const version = getVersion(unlinkedBytecode, ImplFactory.bytecode, encodedArgs);
  const layout = getStorageLayout(validations, version);

  if (opts.kind === undefined) {
    opts.kind = inferProxyKind(validations, version);
  }

  if (proxyAddress !== undefined) {
    await setProxyKind(provider, proxyAddress, opts);
  }

  const fullOpts = withDefaults(opts);

  assertUpgradeSafe(validations, version, fullOpts);

  if (proxyAddress !== undefined) {
    const manifest = await Manifest.forNetwork(provider);
    let currentImplAddress: string;
    if (opts.kind === 'beacon') {
      const currentBeaconAddress = await getBeaconAddress(provider, proxyAddress);
      // TODO check if it's really a beacon
      const BeaconProxyFactory = await getBeaconProxyFactory(hre, ImplFactory.signer); 
      // TODO see if there's a better way to attach
      const beaconContract = await BeaconProxyFactory.attach(currentBeaconAddress);
      currentImplAddress = await beaconContract.implementation();
    } else {
      currentImplAddress = await getImplementationAddress(provider, proxyAddress);
    }
    const currentLayout = await getStorageLayoutForAddress(manifest, validations, currentImplAddress);
    assertStorageUpgradeSafe(currentLayout, layout, fullOpts);
  }

  const impl = await fetchOrDeploy(version, provider, async () => {
    const deployment = await deploy(ImplFactory, ...fullOpts.constructorArgs);
    return { ...deployment, layout };
  });

  return { impl, kind: opts.kind };
}
