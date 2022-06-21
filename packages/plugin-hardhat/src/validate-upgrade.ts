import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory } from 'ethers';

import {
  ContractAddressOrInstance,
  getContractAddress,
  DeployImplementationOptions,
} from './utils';
import {
  getBeaconAddress,
  isBeaconProxy,
  isTransparentOrUUPSProxy,
  isBeacon,
  ValidateUpgradeUnsupportedError,
} from '@openzeppelin/upgrades-core';
import { validateBeaconImpl, validateProxyImpl } from './utils/validate-impl';

export type ValidateUpgradeFunction = (
  proxyOrBeaconAddress: ContractAddressOrInstance,
  ImplFactory: ContractFactory,
  opts?: DeployImplementationOptions,
) => Promise<void>;

export function makeValidateUpgrade(hre: HardhatRuntimeEnvironment): ValidateUpgradeFunction {
  return async function validateUpgrade(proxyOrBeacon, ImplFactory, opts: DeployImplementationOptions = {}) {
    const proxyOrBeaconAddress = getContractAddress(proxyOrBeacon);
    const { provider } = hre.network;
    if (await isTransparentOrUUPSProxy(provider, proxyOrBeaconAddress)) {
      await validateProxyImpl(hre, ImplFactory, opts, proxyOrBeaconAddress);
    } else if (await isBeaconProxy(provider, proxyOrBeaconAddress)) {
      const beaconAddress = await getBeaconAddress(provider, proxyOrBeaconAddress);
      await validateBeaconImpl(hre, ImplFactory, opts, beaconAddress);
    } else if (await isBeacon(provider, proxyOrBeaconAddress)) {
      await validateBeaconImpl(hre, ImplFactory, opts, proxyOrBeaconAddress);
    } else {
      throw new ValidateUpgradeUnsupportedError(proxyOrBeaconAddress);
    }
  };
}
