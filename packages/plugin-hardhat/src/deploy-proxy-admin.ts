import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { deploy, DeployProxyAdminOptions, getProxyAdminFactory, getSigner } from './utils';
import { Signer } from 'ethers';
import { disableDefender } from './defender/utils';
import { getContractInstance } from './utils/contract-instance';

export interface DeployAdminFunction {
  (signer?: Signer, opts?: DeployProxyAdminOptions): Promise<string>;
}

export function makeDeployProxyAdmin(hre: HardhatRuntimeEnvironment, defenderModule: boolean): DeployAdminFunction {
  return async function deployProxyAdmin(signer?: Signer, opts: DeployProxyAdminOptions = {}) {
    disableDefender(hre, defenderModule, opts, deployProxyAdmin.name);

    const AdminFactory = await getProxyAdminFactory(hre, signer);

    const initialOwner = opts.initialOwner ?? (await (signer ?? getSigner(AdminFactory.runner))?.getAddress());
    // TODO give an error if initialOwner is undefined

    console.log('Deploying ProxyAdmin with initial owner', initialOwner);
    
    const deployment = await deploy(hre, opts, AdminFactory, initialOwner);
    const contractInstance = getContractInstance(hre, AdminFactory, opts, deployment);

    return await (await contractInstance.waitForDeployment()).getAddress();
  };
}
