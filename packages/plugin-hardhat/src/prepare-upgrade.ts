import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, ethers } from 'ethers';

import { Options, ContractAddressOrInstance, getContractAddress, deployProxyImpl, deployBeaconImpl, DeployTransaction } from './utils';
import {
  getBeaconAddress,
  isBeaconProxy,
  isTransparentOrUUPSProxy,
  isBeacon,
  PrepareUpgradeUnsupportedError,
} from '@openzeppelin/upgrades-core';

export type PrepareUpgradeFunction = (
  proxyOrBeaconAddress: ContractAddressOrInstance,
  ImplFactory: ContractFactory,
  opts?: Options,
) => Promise<PrepareUpgradeResponse>;

export type PrepareUpgradeResponse = string | { txResponse: ethers.providers.TransactionResponse, address: string };

export function makePrepareUpgrade(hre: HardhatRuntimeEnvironment): PrepareUpgradeFunction {
  return async function prepareUpgrade(proxyOrBeacon, ImplFactory, opts: Options = {}) {
    const proxyOrBeaconAddress = getContractAddress(proxyOrBeacon);
    const { provider } = hre.network;
    let deployedImpl;
    if (await isTransparentOrUUPSProxy(provider, proxyOrBeaconAddress)) {
      deployedImpl = await deployProxyImpl(hre, ImplFactory, opts, proxyOrBeaconAddress);
    } else if (await isBeaconProxy(provider, proxyOrBeaconAddress)) {
      const beaconAddress = await getBeaconAddress(provider, proxyOrBeaconAddress);
      deployedImpl = await deployBeaconImpl(hre, ImplFactory, opts, beaconAddress);
    } else if (await isBeacon(provider, proxyOrBeaconAddress)) {
      deployedImpl = await deployBeaconImpl(hre, ImplFactory, opts, proxyOrBeaconAddress);
    } else {
      throw new PrepareUpgradeUnsupportedError(proxyOrBeaconAddress);
    }
    return deployedImpl.impl;
  };
}
