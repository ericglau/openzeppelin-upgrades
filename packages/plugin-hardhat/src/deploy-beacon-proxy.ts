import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ContractFactory } from 'ethers';

import {
  Manifest,
  logWarning,
  ProxyDeployment,
  isBeacon,
  DeployBeaconProxyUnsupportedError,
  DeployBeaconProxyKindError,
  UpgradesError,
  RemoteDeploymentId,
} from '@ericglau/upgrades-core';

import {
  DeployBeaconProxyOptions,
  deploy,
  DeployTransaction,
  getBeaconProxyFactory,
  ContractAddressOrInstance,
  getContractAddress,
  getInitializerData,
  getSigner,
} from './utils';
import { enableDefender } from './defender/utils';
import { getContractInstance } from './utils/contract-instance';
import { ContractTypeOfFactory } from './type-extensions';

export interface DeployBeaconProxyFunction {
  <F extends ContractFactory>(
    beacon: ContractAddressOrInstance,
    attachTo: F,
    args?: unknown[],
    opts?: DeployBeaconProxyOptions,
  ): Promise<ContractTypeOfFactory<F>>;
  <F extends ContractFactory>(
    beacon: ContractAddressOrInstance,
    attachTo: F,
    opts?: DeployBeaconProxyOptions,
  ): Promise<ContractTypeOfFactory<F>>;
}

export function makeDeployBeaconProxy(
  hre: HardhatRuntimeEnvironment,
  defenderModule: boolean,
): DeployBeaconProxyFunction {
  return async function deployBeaconProxy<F extends ContractFactory>(
    beacon: ContractAddressOrInstance,
    attachTo: F,
    args: unknown[] | DeployBeaconProxyOptions = [],
    opts: DeployBeaconProxyOptions = {},
  ): Promise<ContractTypeOfFactory<F>> {
    if (!(attachTo instanceof ContractFactory)) {
      throw new UpgradesError(
        `attachTo must specify a contract factory`,
        () => `Include the contract factory for the beacon's current implementation in the attachTo parameter`,
      );
    }
    if (!Array.isArray(args)) {
      opts = args;
      args = [];
    }

    opts = enableDefender(hre, defenderModule, opts);

    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

    if (opts.kind !== undefined && opts.kind !== 'beacon') {
      throw new DeployBeaconProxyKindError(opts.kind);
    }
    opts.kind = 'beacon';

    const beaconAddress = await getContractAddress(beacon);
    if (!(await isBeacon(provider, beaconAddress))) {
      throw new DeployBeaconProxyUnsupportedError(beaconAddress);
    }

    const data = getInitializerData(attachTo.interface, args, opts.initializer);

    if (await manifest.getAdmin()) {
      logWarning(`A proxy admin was previously deployed on this network`, [
        `This is not natively used with the current kind of proxy ('beacon').`,
        `Changes to the admin will have no effect on this new proxy.`,
      ]);
    }

    const BeaconProxyFactory = opts.proxyFactory || (await getBeaconProxyFactory(hre, getSigner(attachTo.runner)));
    const proxyDeployment: Required<ProxyDeployment> & DeployTransaction & RemoteDeploymentId = Object.assign(
      { kind: opts.kind },
      await (opts.deployFunction || deploy)(hre, opts, BeaconProxyFactory, beaconAddress, data),
    );

    await manifest.addProxy(proxyDeployment);

    return getContractInstance(hre, attachTo, opts, proxyDeployment);
  };
}
