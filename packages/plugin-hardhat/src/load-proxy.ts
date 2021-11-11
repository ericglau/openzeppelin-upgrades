import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Contract, ethers, Signer } from 'ethers';

import { Manifest, getBeaconAddress } from '@openzeppelin/upgrades-core';

import { Interface } from '@ethersproject/abi';
import { ContractAddressOrInstance, getContractAddress } from './utils';
import { getBeaconInterfaceFromManifest } from './deploy-beacon-proxy';

export interface LoadProxyFunction {
  (proxy: Contract, signer?: Signer): Promise<Contract>;
  (proxy: ContractAddressOrInstance, signer: Signer): Promise<Contract>;
}

export function makeLoadProxy(hre: HardhatRuntimeEnvironment): LoadProxyFunction {
  return async function loadProxy(proxy: ContractAddressOrInstance | Contract, signer?: Signer) {
    const { provider } = hre.network;

    const proxyAddress = getContractAddress(proxy);
    const beaconAddress = await getBeaconAddress(provider, proxyAddress);
    let contractInterface: Interface | undefined;
    try {
      contractInterface = await getBeaconInterfaceFromManifest(hre, beaconAddress, proxy instanceof Contract ? proxy.signer : signer);
      if (contractInterface === undefined) {
        // TODO combine with the below error
        throw new Error(
          `The implementation for the beacon at address ${beaconAddress} was not found in the network manifest. Use the implementation's contract factory to attach to the proxy address instead.`,
        );
      }
      if (signer === undefined && proxy instanceof Contract) {
        signer = proxy.signer;
      }
      // TODO
      return new Contract(proxyAddress, contractInterface, signer);
    } catch (e: any) {
      // TODO change to impl addr and change msg?
      throw new Error(
        `The implementation for the beacon at address ${beaconAddress} was not found in the network manifest. Use the implementation's contract factory to attach to the proxy address instead.`,
      );
    }
  };
}


