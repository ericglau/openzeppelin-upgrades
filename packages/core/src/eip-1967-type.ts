import {
  EIP1967BeaconNotFound,
  EIP1967ImplementationNotFound,
  getAdminAddress,
  getBeaconAddress,
  getImplementationAddress,
  isEmptySlot,
} from './eip-1967';
import { UpgradesError } from './error';
import { ProxyDeployment } from './manifest';
import { EthereumProvider } from './provider';

export async function isTransparentOrUUPSProxy(provider: EthereumProvider, address: string): Promise<boolean> {
  try {
    await getImplementationAddress(provider, address);
    // if an exception was not encountered above, then this address is a transparent/uups proxy
    return true;
  } catch (e: any) {
    if (e instanceof EIP1967ImplementationNotFound) {
      return false;
    } else {
      throw e;
    }
  }
}

async function isTransparentProxy(provider: EthereumProvider, address: string): Promise<boolean> {
  const adminAddress = await getAdminAddress(provider, address);
  return !isEmptySlot(adminAddress);
}

export async function isBeaconProxy(provider: EthereumProvider, address: string): Promise<boolean> {
  try {
    await getBeaconAddress(provider, address);
    // if an exception was not encountered above, then this address is a beacon proxy
    return true;
  } catch (e: any) {
    if (e instanceof EIP1967BeaconNotFound) {
      return false;
    } else {
      throw e;
    }
  }
}

/**
 * Determines the kind of proxy at an address by reading its ERC 1967 storage slots.
 *
 * @param provider the Ethereum provider
 * @param proxyAddress the proxy address
 * @returns the proxy kind
 * @throws {UpgradesError} if the contract at address does not look like an ERC 1967 proxy
 */
export async function detectProxyKind(provider: EthereumProvider, proxyAddress: string) {
  let importKind: ProxyDeployment['kind'];
  if (await isTransparentProxy(provider, proxyAddress)) {
    importKind = 'transparent';
  } else if (await isTransparentOrUUPSProxy(provider, proxyAddress)) {
    importKind = 'uups';
  } else if (await isBeaconProxy(provider, proxyAddress)) {
    importKind = 'beacon';
  } else {
    throw new UpgradesError(`Contract at ${proxyAddress} doesn't look like an ERC 1967 proxy`);
  }
  return importKind;
}
