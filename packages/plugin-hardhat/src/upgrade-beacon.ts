import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ethers, ContractFactory, Contract, Signer } from 'ethers';

import { Manifest, getAdminAddress, getCode, getBeaconAddress, ProxyDeployment } from '@openzeppelin/upgrades-core';

import {
  UpgradeOptions,
  deployImpl,
  getTransparentUpgradeableProxyFactory,
  getProxyAdminFactory,
  getContractAddress,
  ContractAddressOrInstance,
  getUpgradeableBeaconFactory,
  deployImplForBeacon,
} from './utils';

export type UpgradeBeaconFunction = (
  beacon: ContractAddressOrInstance,
  ImplFactory: ContractFactory
) => Promise<Contract>;

export function makeUpgradeBeacon(hre: HardhatRuntimeEnvironment): UpgradeBeaconFunction {
  return async function upgradeBeacon(beacon, ImplFactory) {
    const beaconAddress = getContractAddress(beacon);

    const opts = { kind: 'beacon' } as UpgradeOptions; // TODO
    const { impl: nextImpl } = await deployImplForBeacon(hre, ImplFactory, opts, beaconAddress);
    // upgrade kind is inferred above
    const upgradeTo = await getBeaconUpgrader(beaconAddress, opts.kind, ImplFactory.signer);
    const upgradeTx = await upgradeTo(nextImpl);

/*    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);
    await manifest.addBeacon(beaconDeployment);*/


    

    // TODO avoid duplicate code from below
    const UpgradeableBeaconFactory = await getUpgradeableBeaconFactory(hre, ImplFactory.signer);
    const beaconContract = UpgradeableBeaconFactory.attach(beaconAddress);
    // @ts-ignore Won't be readonly because inst was created through attach.
    beaconContract.deployTransaction = upgradeTx;
    return beaconContract;

  };

  type BeaconUpgrader = (nextImpl: string) => Promise<ethers.providers.TransactionResponse>;

  async function getBeaconUpgrader(beaconAddress: string, kind: ProxyDeployment['kind'] | undefined, signer: Signer): Promise<BeaconUpgrader> {
    //const { provider } = hre.network;

    //const currentBeaconAddress = await getBeaconAddress(provider, proxyAddress);
    const UpgradeableBeaconFactory = await getUpgradeableBeaconFactory(hre, signer);
    const beaconContract = UpgradeableBeaconFactory.attach(beaconAddress);

    return (nextImpl) => {
      return beaconContract.upgradeTo(nextImpl);
    }
  }
}
