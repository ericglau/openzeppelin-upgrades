import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract } from 'ethers';

import { Manifest, BeaconDeployment } from '@openzeppelin/upgrades-core';

import {
  DeployOptions,
  deploy,
  DeployTransaction,
  getUpgradeableBeaconFactory,
  deployImplForBeacon,
} from './utils';

export interface DeployBeaconFunction {
  (ImplFactory: ContractFactory, opts?: DeployOptions): Promise<Contract>;
}

export function makeDeployBeacon(hre: HardhatRuntimeEnvironment): DeployBeaconFunction {
  return async function deployBeacon(
    ImplFactory: ContractFactory,
    opts: DeployOptions = {},
  ) {

    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

    const { impl } = await deployImplForBeacon(hre, ImplFactory, opts);

    let beaconDeployment: Required<BeaconDeployment & DeployTransaction>;

    const UpgradeableBeaconFactory = await getUpgradeableBeaconFactory(hre, ImplFactory.signer);
    beaconDeployment = await deploy(UpgradeableBeaconFactory, impl);

    await manifest.addBeacon(beaconDeployment);

    const beacon = UpgradeableBeaconFactory.attach(beaconDeployment.address);
    // @ts-ignore Won't be readonly because inst was created through attach.
    beacon.deployTransaction = beaconDeployment.deployTransaction;
    return beacon;
  };
}
