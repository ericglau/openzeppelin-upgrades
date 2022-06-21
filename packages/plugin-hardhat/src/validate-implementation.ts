import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory } from 'ethers';

import {
  DeployImplementationOptions,
} from './utils';
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
