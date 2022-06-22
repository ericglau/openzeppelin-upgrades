import {
  assertStorageUpgradeSafe,
  assertUpgradeSafe,
  getStorageLayoutForAddress,
  Manifest,
} from '@openzeppelin/upgrades-core';
import type { ContractFactory } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployData, getDeployData, processBeaconImpl, processProxyImpl } from './deploy-impl';
import { Options, DeployImplementationOptions } from './options';

export async function validateUpgradeImpl(
  deployData: DeployData,
  opts: DeployImplementationOptions,
  currentImplAddress?: string,
): Promise<void> {
  assertUpgradeSafe(deployData.validations, deployData.version, deployData.fullOpts);

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

  let currentImplAddress: string | undefined = await processProxyImpl(deployData, proxyAddress, opts);

  return validateUpgradeImpl(deployData, opts, currentImplAddress);
}

export async function validateBeaconImpl(
  hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
  beaconAddress?: string,
): Promise<void> {
  const deployData = await getDeployData(hre, ImplFactory, opts);

  let currentImplAddress: string | undefined =  await processBeaconImpl(beaconAddress, deployData);
  
  return validateUpgradeImpl(deployData, opts, currentImplAddress);
}
