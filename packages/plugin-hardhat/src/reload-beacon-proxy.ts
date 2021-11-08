import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Contract, ethers } from 'ethers';

import { Manifest, getBeaconAddress } from '@openzeppelin/upgrades-core';

import {
  ContractAddressOrInstance,
  getContractAddress,
} from './utils';
import { Interface } from '@ethersproject/abi';

export interface ReloadBeaconProxyFunction {
  (proxy: ContractAddressOrInstance): Promise<Contract>;
}

export function makeReloadBeaconProxy(hre: HardhatRuntimeEnvironment): ReloadBeaconProxyFunction {
  return async function reloadBeaconProxy(
    proxy: ContractAddressOrInstance
  ) {
    const { provider } = hre.network;

    const proxyAddress = getContractAddress(proxy);
    const beaconAddress = await getBeaconAddress(provider, proxyAddress);
    let contractInterface: Interface;
    try {
      contractInterface = await getBeaconInterfaceFromManifest(hre, beaconAddress);
      return new Contract(proxyAddress, contractInterface, proxy instanceof Contract ? proxy.signer : undefined);
    } catch (e: any) {
        throw new Error(`Beacon at address ${beaconAddress} was not found in the network manifest. Use the implementation's contract factory to attach to the proxy address instead.`);
      }
    }
}

async function getBeaconInterfaceFromManifest(hre: HardhatRuntimeEnvironment, beaconAddress: string) {
  const { provider } = hre.network;
  const manifest = await Manifest.forNetwork(provider);
  const beaconDeployment = await manifest.getBeaconFromAddress(beaconAddress);
  return new ethers.utils.Interface(beaconDeployment.abi);
}
