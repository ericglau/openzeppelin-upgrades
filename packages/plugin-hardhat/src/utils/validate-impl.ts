import {
  assertNotProxy,
  assertStorageUpgradeSafe,
  assertUpgradeSafe,
  fetchOrDeployGetDeployment,
  getImplementationAddress,
  getImplementationAddressFromBeacon,
  getStorageLayout,
  getStorageLayoutForAddress,
  getUnlinkedBytecode,
  getVersion,
  Manifest,
  processProxyKind,
  StorageLayout,
  ValidationDataCurrent,
  ValidationOptions,
  Version,
} from '@openzeppelin/upgrades-core';
import type { ContractFactory, ethers } from 'ethers';
import { FormatTypes } from 'ethers/lib/utils';
import type { EthereumProvider, HardhatRuntimeEnvironment } from 'hardhat/types';
import { deploy } from './deploy';
import { DeployData, getDeployData } from './deploy-impl';
import { Options, DeployImplementationOptions, withDefaults } from './options';
import { readValidations } from './validations';

export function validateStandaloneImpl(
  deployData: DeployData,
) {
  assertUpgradeSafe(deployData.validations, deployData.version, deployData.fullOpts);
}

export async function validateUpgradeImpl(
  deployData: DeployData,
  opts: DeployImplementationOptions,
  currentImplAddress?: string,
): Promise<any> {
  validateStandaloneImpl(deployData);

  if (currentImplAddress !== undefined) {
    const manifest = await Manifest.forNetwork(deployData.provider);
    const currentLayout = await getStorageLayoutForAddress(manifest, deployData.validations, currentImplAddress);
    if (opts.unsafeSkipStorageCheck !== true) {
      assertStorageUpgradeSafe(currentLayout, deployData.layout, deployData.fullOpts);
    }
  }
}

export async function validateProxyImpl(
  hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
  proxyAddress?: string,
): Promise<void> {
  const deployData = await getDeployData(hre, ImplFactory, opts);

  await processProxyKind(deployData.provider, proxyAddress, opts, deployData.validations, deployData.version);

  let currentImplAddress: string | undefined;
  if (proxyAddress !== undefined) {
    // upgrade scenario
    currentImplAddress = await getImplementationAddress(deployData.provider, proxyAddress);
  }

  return validateUpgradeImpl(deployData, opts, currentImplAddress);
}

export async function validateBeaconImpl(
  hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
  beaconAddress?: string,
): Promise<void> {
  const deployData = await getDeployData(hre, ImplFactory, opts);

  let currentImplAddress;
  if (beaconAddress !== undefined) {
    // upgrade scenario
    await assertNotProxy(deployData.provider, beaconAddress);
    currentImplAddress = await getImplementationAddressFromBeacon(deployData.provider, beaconAddress);
  }
  return validateUpgradeImpl(deployData, opts, currentImplAddress);
}

export async function validateImpl(
  hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
): Promise<void> {
  const deployData = await getDeployData(hre, ImplFactory, opts);

  validateStandaloneImpl(deployData);
}
