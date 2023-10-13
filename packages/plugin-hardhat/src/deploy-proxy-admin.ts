import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { fetchOrDeployAdmin } from '@openzeppelin/upgrades-core';

import { deploy, DeployProxyAdminOptions, getProxyAdminFactory } from './utils';
import { Signer } from 'ethers';
import { disableDefender } from './defender/utils';

export interface DeployAdminFunction {
  (signer?: Signer, opts?: DeployProxyAdminOptions): Promise<string>;
}

export function makeDeployProxyAdmin(hre: HardhatRuntimeEnvironment, defenderModule: boolean): DeployAdminFunction {
  return async function deployProxyAdmin(signer?: Signer, opts: DeployProxyAdminOptions = {}) {
    disableDefender(hre, defenderModule, opts, deployProxyAdmin.name);

    const { provider } = hre.network;

    const AdminFactory = await getProxyAdminFactory(hre, signer);

    const initialOwner = opts.initialOwner ?? (await signer?.getAddress()) ?? undefined;
    // TODO give an error if initialOwner is undefined
    
    return await fetchOrDeployAdmin(provider, () => deploy(hre, opts, AdminFactory, initialOwner), opts);
  };
}
