import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract } from 'ethers';

import { DeployContractOptions } from './utils';
import { deployNonUpgradeableContract } from './utils/deploy-impl';

export interface DeployContractFunction {
  (ImplFactory: ContractFactory, args?: unknown[], opts?: DeployContractOptions): Promise<Contract>;
  (ImplFactory: ContractFactory, opts?: DeployContractOptions): Promise<Contract>;
}

export function makeDeployContract(hre: HardhatRuntimeEnvironment, platformModule: boolean): DeployContractFunction {
  return async function deployContract(
    ImplFactory, 
    args: unknown[] | DeployContractOptions = [],
    opts: DeployContractOptions = {},
  ) {    
    if (!Array.isArray(args)) {
      opts = args;
      args = [];
    }

    if (platformModule && opts.platform === undefined) {
      opts.platform = true;
    }

    if (opts.platform === undefined || !opts.platform) {
      throw new Error("The deployContract function can only be used with the platform option set to true.");
    }
    
    if (opts.constructorArgs !== undefined) {
      throw new Error(`The deployContract function does not support the constructorArgs option. Pass in constructor arguments using the format: deployContract(MyContract, [ 'my arg' ]);`);
    }
    opts.constructorArgs = args;

    const deployed = await deployNonUpgradeableContract(hre, ImplFactory, opts);

    // if (opts.getTxResponse && deployed.txResponse !== undefined) {
    //   return deployed.txResponse;
    // } else {
    //   return deployed.impl;
    // }

    const inst = ImplFactory.attach(deployed.impl);
    // @ts-ignore Won't be readonly because inst was created through attach.
    inst.deployTransaction = deployed.txResponse;
    return inst;

  };
}
