import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory } from 'ethers';

import { DeployImplementationOptions } from './utils';
import { validateStandaloneImpl } from './utils/validate-impl';
import { getDeployData } from './utils/deploy-impl';

export type ValidateImplementationFunction = (
  ImplFactory: ContractFactory,
  opts?: DeployImplementationOptions,
) => Promise<void>;

export function makeValidateImplementation(hre: HardhatRuntimeEnvironment): ValidateImplementationFunction {
  return async function validateImplementation(ImplFactory, opts: DeployImplementationOptions = {}) {
    const deployData = await getDeployData(hre, ImplFactory, opts);
    await validateStandaloneImpl(deployData, opts);
  };
}
