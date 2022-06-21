import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, ethers } from 'ethers';

import {
  ContractAddressOrInstance,
  getContractAddress,
  deployProxyImpl,
  deployBeaconImpl,
  PrepareUpgradeOptions,
} from './utils';
import {
  getBeaconAddress,
  isBeaconProxy,
  isTransparentOrUUPSProxy,
  isBeacon,
  PrepareUpgradeUnsupportedError,
} from '@openzeppelin/upgrades-core';
import { validateImpl } from './utils/validate-impl';

export type ValidateImplementationFunction = (
  ImplFactory: ContractFactory,
  opts?: PrepareUpgradeOptions,
) => Promise<void>;

export function makeValidateImplementation(hre: HardhatRuntimeEnvironment): ValidateImplementationFunction {
  return async function validateImplementation(ImplFactory, opts: PrepareUpgradeOptions = {}) {
    await validateImpl(hre, ImplFactory, opts);
  };
}
