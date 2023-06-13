import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract } from 'ethers';

import { Deployment } from '@openzeppelin/upgrades-core';

import { DeployBeaconOptions, deploy, DeployTransaction, getUpgradeableBeaconFactory, deployBeaconImpl } from './utils';
import { disablePlatform } from './platform/utils';
import { attach } from './utils/attach';

export interface DeployBeaconFunction {
  (ImplFactory: ContractFactory, opts?: DeployBeaconOptions): Promise<Contract>;
}

export function makeDeployBeacon(hre: HardhatRuntimeEnvironment, platformModule: boolean): DeployBeaconFunction {
  return async function deployBeacon(ImplFactory: ContractFactory, opts: DeployBeaconOptions = {}) {
    disablePlatform(hre, platformModule, opts, deployBeacon.name);

    const { impl } = await deployBeaconImpl(hre, ImplFactory, opts);

    const UpgradeableBeaconFactory = await getUpgradeableBeaconFactory(ImplFactory.runner);
    const beaconDeployment: Deployment & DeployTransaction = await deploy(hre, opts, UpgradeableBeaconFactory, impl);
    const beaconContract = attach(UpgradeableBeaconFactory, beaconDeployment.address);

    // @ts-ignore Won't be readonly because beaconContract was created through attach.
    beaconContract.deployTransaction = beaconDeployment.deployTransaction;
    return beaconContract;
  };
}
