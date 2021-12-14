import { call, EIP1967BeaconNotFound, EIP1967ImplementationNotFound, getBeaconAddress, getImplementationAddress } from '.';

import { EthereumProvider } from './provider';
import { addHexPrefix, isValidAddress, toChecksumAddress, unpadHexString } from 'ethereumjs-util';

export async function getImplementationAddressFromBeacon1(provider: EthereumProvider, beaconAddress: string): Promise<any> {
  const result = await call(provider, beaconAddress);
  const unpad = unpadHexString(result);
  const prefixed = addHexPrefix(unpad);
  const checksummed = toChecksumAddress(prefixed);
  return checksummed;
}

/**
 * Checks if the address looks like a beacon.
 *
 * @returns true if the address has an implementation() function that returns an address, false otherwise.
 */
 export async function isBeacon(provider: EthereumProvider, beaconAddress: string) {
  try {
    return isValidAddress(await getImplementationAddressFromBeacon1(provider, beaconAddress));
  } catch (e: any) {
    if (e.message.includes('function selector was not recognized') || e.message.includes('call revert exception')) {
      return false;
    } else {
      throw e;
    }
  }
}

/**
 * Gets the implementation address from a UUPS/Transparent/Beacon proxy.
 *
 * @returns a Promise with the implementation address, or undefined if a UUPS/Transparent/Beacon proxy is not located at the address.
 */
 export async function getImplementationAddressFromProxy(
  provider: EthereumProvider,
  proxyAddress: string,
): Promise<string | undefined> {
  try {
    return await getImplementationAddress(provider, proxyAddress);
  } catch (e: any) {
    if (e instanceof EIP1967ImplementationNotFound) {
      try {
        const beaconAddress = await getBeaconAddress(provider, proxyAddress);
        return await getImplementationAddressFromBeacon1(provider, beaconAddress);
      } catch (e: any) {
        if (e instanceof EIP1967BeaconNotFound) {
          return undefined;
        } else {
          throw e;
        }
      }
    } else {
      throw e;
    }
  }
}