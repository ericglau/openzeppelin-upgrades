import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ContractFactory } from 'ethers';

import { ContractAddressOrInstance, getContractAddress, DeployImplementationOptions } from './utils';
import {
  getBeaconAddress,
  isBeaconProxy,
  isTransparentOrUUPSProxy,
  isBeacon,
  ValidateUpgradeUnsupportedError,
  assertUpgradeSafe,
  assertStorageUpgradeSafe,
} from '@openzeppelin/upgrades-core';
import { BeaconValidator, ProxyValidator, Validator } from './utils/validate-impl';
import { getDeployData } from './utils/deploy-impl';

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
      await validator.validate(hre, newImplFactory, opts);
    }
  };
}

