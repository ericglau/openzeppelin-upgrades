import chalk from 'chalk';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Manifest } from '@openzeppelin/upgrades-core';
import { Contract, Signer } from 'ethers';
import { getProxyAdminFactory } from './utils';
import { attach } from './utils/ethers';

export type GetInstanceFunction = (signer?: Signer) => Promise<Contract>;

export function makeGetInstanceFunction(hre: HardhatRuntimeEnvironment): GetInstanceFunction {
  // TODO mark this as deprecated since it is not used with 5.0 proxies
  return async function getInstance(signer?: Signer) {
    return await getManifestAdmin(hre, signer);
  };
}

export async function getManifestAdmin(hre: HardhatRuntimeEnvironment, signer?: Signer): Promise<Contract> {
  const manifest = await Manifest.forNetwork(hre.network.provider);
  const manifestAdmin = await manifest.getAdmin();
  const proxyAdminAddress = manifestAdmin?.address;

  if (proxyAdminAddress === undefined) {
    throw new Error('No ProxyAdmin was found in the network manifest');
  }

  const AdminFactory = await getProxyAdminFactory(hre, signer);
  return attach(AdminFactory, proxyAdminAddress);
}
