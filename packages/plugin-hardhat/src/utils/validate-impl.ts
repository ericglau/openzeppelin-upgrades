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
  const currentImplAddress = await processProxyImpl(deployData, proxyAddress, opts);
  return validateUpgradeImpl(deployData, opts, currentImplAddress);
}

export async function validateBeaconImpl(
  hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
  beaconAddress?: string,
): Promise<void> {
  const deployData = await getDeployData(hre, ImplFactory, opts);
  const currentImplAddress = await processBeaconImpl(beaconAddress, deployData);
  return validateUpgradeImpl(deployData, opts, currentImplAddress);
}

export abstract class Validator {
  public proxyOrBeaconAddress: string | undefined;
  private static deployData: Promise<DeployData>;

  constructor(proxyOrBeaconAddress?: string) {
    this.proxyOrBeaconAddress = proxyOrBeaconAddress;
  }

  static getDeployData(hre: HardhatRuntimeEnvironment,
    ImplFactory: ContractFactory,
    opts: Options) {
      if (!Validator.deployData) {
        Validator.deployData = getDeployData(hre, ImplFactory, opts);
      }
      return Validator.deployData;
  }

  async validate(hre: HardhatRuntimeEnvironment,
    ImplFactory: ContractFactory,
    opts: Options) {
    const deployData = await Validator.getDeployData(hre, ImplFactory, opts);
    const currentImplAddress = await this.processImpl(deployData, this.proxyOrBeaconAddress, opts);
    return validateUpgradeImpl(deployData, opts, currentImplAddress);
  }

  abstract processImpl(deployData: DeployData, proxyOrBeaconAddress: any, opts: Options): Promise<string | undefined>;

  async validateUpgradeImpl(
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
}

export class ProxyValidator extends Validator {
  processImpl(deployData: DeployData, proxyOrBeaconAddress: any, opts: Options): Promise<string | undefined> {
    return processProxyImpl(deployData, proxyOrBeaconAddress, opts);
  }
}

export class BeaconValidator extends Validator {
  processImpl(deployData: DeployData, proxyOrBeaconAddress: any, opts: Options): Promise<string | undefined> {
    return processBeaconImpl(proxyOrBeaconAddress, deployData);
  }
}