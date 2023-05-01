import chalk from 'chalk';
import { getAdminAddress, Manifest } from '@openzeppelin/upgrades-core';
import { ContractInstance, getProxyAdminFactory, wrapProvider, UpgradeOptions, withDefaults, Deployer } from './utils';

const SUCCESS_CHECK = chalk.green('✔') + ' ';
const FAILURE_CROSS = chalk.red('✘') + ' ';

async function changeProxyAdmin(proxyAddress: string, newAdmin: string, opts: UpgradeOptions = {}): Promise<void> {
  const { deployer } = withDefaults(opts);
  const provider = wrapProvider(deployer.provider);
  const admin = await getManifestAdmin(deployer);
  const proxyAdminAddress = await getAdminAddress(provider, proxyAddress);

  if (admin.address !== proxyAdminAddress) {
    throw new Error('Proxy admin is not the one registered in the network manifest');
  } else if (admin.address !== newAdmin) {
    await admin.changeProxyAdmin(proxyAddress, newAdmin);
  }
}

async function transferProxyAdminOwnership(newOwner: string, opts: UpgradeOptions = {}): Promise<void> {
  const { deployer } = withDefaults(opts);
  const provider = wrapProvider(deployer.provider);
  const admin = await getManifestAdmin(deployer);
  await admin.transferOwnership(newOwner);

  const manifest = await Manifest.forNetwork(provider);
  const { proxies } = await manifest.read();
  for (const { address, kind } of proxies) {
    if (admin.address == (await getAdminAddress(provider, address))) {
      console.log(SUCCESS_CHECK + `${address} (${kind}) proxy ownership transfered through admin proxy`);
    } else {
      console.log(FAILURE_CROSS + `${address} (${kind}) proxy ownership not affected by admin proxy`);
    }
  }
}

async function getInstance(opts: UpgradeOptions = {}): Promise<ContractInstance> {
  const { deployer } = withDefaults(opts);
  return await getManifestAdmin(deployer);
}

async function getManifestAdmin(deployer: Deployer): Promise<ContractInstance> {
  const provider = wrapProvider(deployer.provider);
  const manifest = await Manifest.forNetwork(provider);
  const manifestAdmin = await manifest.getAdmin();

  const AdminFactory = getProxyAdminFactory();
  AdminFactory.setProvider(deployer.provider);

  const proxyAdminAddress = manifestAdmin?.address;

  if (proxyAdminAddress === undefined) {
    throw new Error('No ProxyAdmin was found in the network manifest');
  }

  return new AdminFactory(proxyAdminAddress);
}

export const admin = {
  getInstance,
  transferProxyAdminOwnership,
  changeProxyAdmin,
};
