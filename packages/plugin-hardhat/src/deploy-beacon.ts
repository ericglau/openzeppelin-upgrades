import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract } from 'ethers';

import { Manifest, fetchOrDeployAdmin, logWarning, BeaconDeployment } from '@openzeppelin/upgrades-core';

import {
  DeployOptions,
  deploy,
  deployImpl,
  getProxyFactory,
  getTransparentUpgradeableProxyFactory,
  getProxyAdminFactory,
  DeployTransaction,
  getBeaconProxyFactory,
  getUpgradeableBeaconFactory,
} from './utils';

export interface DeployBeaconFunction {
  (ImplFactory: ContractFactory): Promise<Contract>;
}

export function makeDeployBeacon(hre: HardhatRuntimeEnvironment): DeployBeaconFunction {
  return async function deployBeacon(
    ImplFactory: ContractFactory,
  ) {

    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

    const { impl } = await deployImpl(hre, ImplFactory, { kind: 'beacon' } as DeployOptions);
    //const data = getInitializerData(ImplFactory, args, opts.initializer);

    if (await manifest.getAdmin()) {
      logWarning(`A proxy admin was previously deployed on this network`, [
        `This is not natively used with the current kind of proxy ('beacon').`,
        `Changes to the admin will have no effect on this new proxy.`,
      ]);
    }

    let beaconDeployment: Required<BeaconDeployment & DeployTransaction>;

    const UpgradeableBeaconFactory = await getUpgradeableBeaconFactory(hre, ImplFactory.signer);
    //beaconDeployment = await deploy(UpgradeableBeaconFactory, impl);
    beaconDeployment = await deploy(UpgradeableBeaconFactory, impl);
    //const BeaconProxyFactory = await getBeaconProxyFactory(hre, ImplFactory.signer);
    //proxyDeployment = Object.assign({ kind }, await deploy(BeaconProxyFactory, beaconDeployment.address, data));

    await manifest.addBeacon(beaconDeployment);

    const beacon = UpgradeableBeaconFactory.attach(beaconDeployment.address);
    // @ts-ignore Won't be readonly because inst was created through attach.
    beacon.deployTransaction = beaconDeployment.deployTransaction;
    return beacon;
  };

}
