import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { fetchOrDeployAdmin } from '@openzeppelin/upgrades-core';

import { deploy, DeployProxyAdminOptions, getProxyAdminFactory } from './utils';
import { Signer } from 'ethers';
import { PlatformUnsupportedError } from './utils/platform-deploy';

export interface DeployAdminFunction {
  (signer?: Signer, opts?: DeployProxyAdminOptions): Promise<string>;
}

export function makeDeployProxyAdmin(hre: HardhatRuntimeEnvironment, platformModule: boolean): DeployAdminFunction {
  return async function deployProxyAdmin(signer?: Signer, opts: DeployProxyAdminOptions = {}) {
    if (platformModule || opts.platform) {
      throw new PlatformUnsupportedError(deployProxyAdmin.name);
    }

    const { provider } = hre.network;

    const AdminFactory = await getProxyAdminFactory(hre, signer);
    return await fetchOrDeployAdmin(provider, () => deploy(hre, opts, AdminFactory), opts);
  };
}
