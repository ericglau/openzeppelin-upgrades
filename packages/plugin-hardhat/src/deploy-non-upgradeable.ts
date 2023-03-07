import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract } from 'ethers';

import { DeployNonUpgradeableOptions } from './utils';
import { deployNonUpgradeable } from './utils/deploy-impl';

export type DeployNonUpgradeableFunction = (
  ImplFactory: ContractFactory,
  opts?: DeployNonUpgradeableOptions,
) => Promise<Contract>;

export function makeDeployNonUpgradeable(hre: HardhatRuntimeEnvironment): DeployNonUpgradeableFunction {
  return async function deploy(ImplFactory, opts: DeployNonUpgradeableOptions = {}) {
    if (opts.platform === undefined || !opts.platform) {
      throw new Error("The deploy function can only be used with the platform option set to true.");
    }
    const deployed = await deployNonUpgradeable(hre, ImplFactory, opts);

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
