import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ethers, ContractFactory, Contract, Signer } from 'ethers';

import { ProxyDeployment } from '@openzeppelin/upgrades-core';

import {
  getContractAddress,
  ContractAddressOrInstance,
  getUpgradeableBeaconFactory,
  deployImplForBeacon,
  Options,
} from './utils';

export type UpgradeBeaconFunction = (
  beacon: ContractAddressOrInstance,
  ImplFactory: ContractFactory,
  opts?: Options,
) => Promise<Contract>;

export function makeUpgradeBeacon(hre: HardhatRuntimeEnvironment): UpgradeBeaconFunction {
  return async function upgradeBeacon(beacon, ImplFactory, opts: Options = {}) {
    const beaconAddress = getContractAddress(beacon);

    const { impl: nextImpl } = await deployImplForBeacon(hre, ImplFactory, opts, beaconAddress);
    const upgradeTo = await getBeaconUpgrader(beaconAddress, ImplFactory.signer);
    const upgradeTx = await upgradeTo(nextImpl);
    
    // TODO avoid duplicate code from below
    const UpgradeableBeaconFactory = await getUpgradeableBeaconFactory(hre, ImplFactory.signer);
    const beaconContract = UpgradeableBeaconFactory.attach(beaconAddress);
    // @ts-ignore Won't be readonly because inst was created through attach.
    beaconContract.deployTransaction = upgradeTx;
    return beaconContract;
  };

  type BeaconUpgrader = (nextImpl: string) => Promise<ethers.providers.TransactionResponse>;

  async function getBeaconUpgrader(beaconAddress: string, signer: Signer): Promise<BeaconUpgrader> {
    const UpgradeableBeaconFactory = await getUpgradeableBeaconFactory(hre, signer);
    const beaconContract = UpgradeableBeaconFactory.attach(beaconAddress);

    return (nextImpl) => {
      return beaconContract.upgradeTo(nextImpl);
    }
  }
}
