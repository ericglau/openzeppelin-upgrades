import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ContractFactory } from 'ethers';

import { ContractAddressOrInstance, getContractAddress, DeployImplementationOptions, Options } from './utils';
import {
  getBeaconAddress,
  isBeaconProxy,
  isTransparentOrUUPSProxy,
  isBeacon,
  ValidateUpgradeUnsupportedError,
  assertUpgradeSafe,
  assertStorageUpgradeSafe,
  getStorageLayoutForAddress,
  Manifest,
} from '@openzeppelin/upgrades-core';
import { validateBeaconImpl, validateProxyImpl, validateUpgradeImpl } from './utils/validate-impl';
import { DeployData, getDeployData, processBeaconImpl, processProxyImpl } from './utils/deploy-impl';

export interface ValidateUpgradeFunction {
  (
    origImplFactory: ContractFactory,
    newImplFactory: ContractFactory,
    opts?: DeployImplementationOptions,
  ): Promise<void>;
  (
    proxyOrBeaconAddress: ContractAddressOrInstance,
    newImplFactory: ContractFactory,
    opts?: DeployImplementationOptions,
  ): Promise<void>;
}

export function makeValidateUpgrade(hre: HardhatRuntimeEnvironment): ValidateUpgradeFunction {
  return async function validateUpgrade(
    addressOrImplFactory: ContractAddressOrInstance | ContractFactory,
    newImplFactory: ContractFactory,
    opts: DeployImplementationOptions = {},
  ) {
    if (addressOrImplFactory instanceof ContractFactory) {
      const newDeployData = await getDeployData(hre, newImplFactory, opts);
      assertUpgradeSafe(newDeployData.validations, newDeployData.version, newDeployData.fullOpts);

      const origDeployData = await getDeployData(hre, addressOrImplFactory, opts);
      if (opts.unsafeSkipStorageCheck !== true) {
        assertStorageUpgradeSafe(origDeployData.layout, newDeployData.layout, newDeployData.fullOpts);
      }
    } else {
      const proxyOrBeaconAddress = getContractAddress(addressOrImplFactory);
      const { provider } = hre.network;

      let validator: Validator;
      if (await isTransparentOrUUPSProxy(provider, proxyOrBeaconAddress)) {
        validator = new ProxyValidator(proxyOrBeaconAddress);
      } else if (await isBeaconProxy(provider, proxyOrBeaconAddress)) {
        const beaconAddress = await getBeaconAddress(provider, proxyOrBeaconAddress);
        validator = new BeaconValidator(beaconAddress);
      } else if (await isBeacon(provider, proxyOrBeaconAddress)) {
        validator = new BeaconValidator(proxyOrBeaconAddress);
      } else {
        throw new ValidateUpgradeUnsupportedError(proxyOrBeaconAddress);
      }
      await validator.run(hre, newImplFactory, opts);
    }
  };
}

abstract class Validator {
  proxyOrBeaconAddress: string | undefined;

  constructor(proxyOrBeaconAddress?: string) {
    this.proxyOrBeaconAddress = proxyOrBeaconAddress;
  }

  async run(hre: HardhatRuntimeEnvironment,
    ImplFactory: ContractFactory,
    opts: Options) {
    const deployData = await getDeployData(hre, ImplFactory, opts);
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

class ProxyValidator extends Validator {
  processImpl(deployData: DeployData, proxyOrBeaconAddress: any, opts: Options): Promise<string | undefined> {
    return processProxyImpl(deployData, proxyOrBeaconAddress, opts);
  }
}

class BeaconValidator extends Validator {
  processImpl(deployData: DeployData, proxyOrBeaconAddress: any, opts: Options): Promise<string | undefined> {
    return processBeaconImpl(proxyOrBeaconAddress, deployData);
  }
}