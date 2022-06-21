import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, ethers } from 'ethers';

import {
  ContractAddressOrInstance,
  getContractAddress,
  deployProxyImpl,
  deployBeaconImpl,
  DeployImplementationOptions,
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
  opts?: DeployImplementationOptions,
) => Promise<void>;

export function makeValidateImplementation(hre: HardhatRuntimeEnvironment): ValidateImplementationFunction {
  return async function validateImplementation(ImplFactory, opts: DeployImplementationOptions = {}) {
    await validateImpl(hre, ImplFactory, opts);
  };
}
