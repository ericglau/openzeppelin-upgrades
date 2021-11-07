import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ethers, ContractFactory, Contract, Signer } from 'ethers';

import { Manifest, getAdminAddress, getCode, getBeaconAddress } from '@openzeppelin/upgrades-core';

import {
  UpgradeOptions,
  deployImpl,
  getTransparentUpgradeableProxyFactory,
  getProxyAdminFactory,
  getContractAddress,
  ContractAddressOrInstance,
  getUpgradeableBeaconFactory,
} from './utils';

export type UpgradeFunction = (
  proxy: ContractAddressOrInstance,
  ImplFactory: ContractFactory,
  opts?: UpgradeOptions,
) => Promise<Contract>;

export function makeUpgradeProxy(hre: HardhatRuntimeEnvironment): UpgradeFunction {
  return async function upgradeProxy(proxy, ImplFactory, opts: UpgradeOptions = {}) {
    const proxyAddress = getContractAddress(proxy);

    const { impl: nextImpl } = await deployImpl(hre, ImplFactory, opts, proxyAddress);
    // upgrade kind is inferred above
    const upgradeTo = await getUpgrader(proxyAddress, opts, ImplFactory.signer);
    const call = encodeCall(ImplFactory, opts.call);
    const upgradeTx = await upgradeTo(nextImpl, call);

    const inst = ImplFactory.attach(proxyAddress);
    // @ts-ignore Won't be readonly because inst was created through attach.
    inst.deployTransaction = upgradeTx;
    return inst;
  };

  type Upgrader = (nextImpl: string, call?: string) => Promise<ethers.providers.TransactionResponse>;

  async function getUpgrader(proxyAddress: string, opts: UpgradeOptions = {}, signer: Signer): Promise<Upgrader> {
    const { provider } = hre.network;

    const adminAddress = await getAdminAddress(provider, proxyAddress);
    const adminBytecode = await getCode(provider, adminAddress);

    if (adminBytecode === '0x') {
      if (opts.kind === 'beacon') {
        const currentBeaconAddress = await getBeaconAddress(provider, proxyAddress);
        // TODO check if it's really a beacon
        const UpgradeableBeaconFactory = await getUpgradeableBeaconFactory(hre, signer);
        const beaconContract = UpgradeableBeaconFactory.attach(currentBeaconAddress);

        return (nextImpl, call) => {
          if (call !== undefined) {
            throw new Error('Beacon does not support calling a function while upgrading the implementation contract');
          }
          return beaconContract.upgradeTo(nextImpl);
        }
      } else {
        // No admin contract: use TransparentUpgradeableProxyFactory to get proxiable interface
        const TransparentUpgradeableProxyFactory = await getTransparentUpgradeableProxyFactory(hre, signer);
        const proxy = TransparentUpgradeableProxyFactory.attach(proxyAddress);

        return (nextImpl, call) => (call ? proxy.upgradeToAndCall(nextImpl, call) : proxy.upgradeTo(nextImpl));
      }
    } else {
      // Admin contract: redirect upgrade call through it
      const manifest = await Manifest.forNetwork(provider);
      const AdminFactory = await getProxyAdminFactory(hre, signer);
      const admin = AdminFactory.attach(adminAddress);
      const manifestAdmin = await manifest.getAdmin();

      if (admin.address !== manifestAdmin?.address) {
        throw new Error('Proxy admin is not the one registered in the network manifest');
      }

      return (nextImpl, call) =>
        call ? admin.upgradeAndCall(proxyAddress, nextImpl, call) : admin.upgrade(proxyAddress, nextImpl);
    }
  }
}

function encodeCall(factory: ContractFactory, call: UpgradeOptions['call']): string | undefined {
  if (!call) {
    return undefined;
  }

  if (typeof call === 'string') {
    call = { fn: call };
  }

  return factory.interface.encodeFunctionData(call.fn, call.args ?? []);
}
