import { Manifest, getAdminAddress, getCode, EthereumProvider, getImplementationAddressFromProxy, UpgradesError } from '@openzeppelin/upgrades-core';

import {
  ContractClass,
  ContractInstance,
  wrapProvider,
  deployProxyImpl,
  getTransparentUpgradeableProxyFactory,
  getProxyAdminFactory,
  UpgradeOptions,
  withDefaults,
  getContractAddress,
  ContractAddressOrInstance,
} from './utils';
import { getInterfaceFromManifest } from './utils/impl-interface';

export async function loadProxy(
  proxy: ContractClass
): Promise<ContractInstance> {
  const { deployer } = withDefaults();
  const provider = wrapProvider(deployer.provider);

  // TODO see if "contract class" is the right terminology here.
  if (proxy.address === undefined) {
    throw new Error('loadProxy() must be called with a contract class that includes the proxy address.');
  }

  const proxyAddress = proxy.address;

  // TODO see if this should be moved to core
  const implAddress = await getImplementationAddressFromProxy(provider, proxyAddress);
  if (implAddress === undefined) {
    throw new UpgradesError(
      `Contract at ${proxyAddress} doesn't look like a supported proxy`,
      () => 'Only transparent, UUPS, or beacon proxies can be loaded with the loadProxy() function.',
    );
  }

  // TODO see if we can provide an example based on the testcase to be created
  const contractInterface = await getInterfaceFromManifest(provider, proxy, implAddress);
  if (contractInterface === undefined) {
    throw new UpgradesError(
      `Implementation ${implAddress} was not found in the network manifest.`,
      () => `Instantiate the implementation's contract class with the proxy address ${proxyAddress} instead.`,
    );
  }

  return (contractInterface as any).at(proxyAddress);

//  contractInterface.address = proxy.address;
  //const contract = new contractInterface(proxy.address);
  //return contract;

//  return new Contract(proxyAddress, contractInterface, signer);
/*

  const upgradeTo = await getUpgrader(provider, Contract, proxyAddress);
  const { impl: nextImpl } = await deployProxyImpl(Contract, opts, proxyAddress);
  const call = encodeCall(Contract, opts.call);
  await upgradeTo(nextImpl, call);

  Contract.address = proxyAddress;
  return new Contract(proxyAddress);*/
}
/*
type Upgrader = (nextImpl: string, call?: string) => Promise<void>;

async function getUpgrader(
  provider: EthereumProvider,
  contractTemplate: ContractClass,
  proxyAddress: string,
): Promise<Upgrader> {
  const adminAddress = await getAdminAddress(provider, proxyAddress);
  const adminBytecode = await getCode(provider, adminAddress);

  if (adminBytecode === '0x') {
    // No admin contract: use TransparentUpgradeableProxyFactory to get proxiable interface
    const TransparentUpgradeableProxyFactory = getTransparentUpgradeableProxyFactory(contractTemplate);
    const proxy = new TransparentUpgradeableProxyFactory(proxyAddress);

    return (nextImpl, call) => (call ? proxy.upgradeToAndCall(nextImpl, call) : proxy.upgradeTo(nextImpl));
  } else {
    // Admin contract: redirect upgrade call through it
    const manifest = await Manifest.forNetwork(provider);
    const AdminFactory = getProxyAdminFactory(contractTemplate);
    const admin = new AdminFactory(adminAddress);
    const manifestAdmin = await manifest.getAdmin();

    if (admin.address !== manifestAdmin?.address) {
      throw new Error('Proxy admin is not the one registered in the network manifest');
    }

    return (nextImpl, call) =>
      call ? admin.upgradeAndCall(proxyAddress, nextImpl, call) : admin.upgrade(proxyAddress, nextImpl);
  }
}

function encodeCall(factory: ContractClass, call: UpgradeOptions['call']): string | undefined {
  if (!call) {
    return undefined;
  }

  if (typeof call === 'string') {
    call = { fn: call };
  }

  const contract = new (factory as any).web3.eth.Contract((factory as any)._json.abi);
  return contract.methods[call.fn](...(call.args ?? [])).encodeABI();
}
*/