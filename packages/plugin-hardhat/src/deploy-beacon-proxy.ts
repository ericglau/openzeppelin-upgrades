import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract, Signer } from 'ethers';

import { Manifest, fetchOrDeployAdmin, logWarning, ProxyDeployment, Deployment } from '@openzeppelin/upgrades-core';

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
  UpgradeOptions,
} from './utils';

export interface DeployBeaconProxyFunction {
  (ImplFactory: ContractFactory, beacon: Contract, opts?: UpgradeOptions): Promise<Contract>;
}

export function makeDeployBeaconProxy(hre: HardhatRuntimeEnvironment): DeployBeaconProxyFunction {
  return async function deployBeaconProxy(
    ImplFactory: ContractFactory,
    beacon: Contract, // TODO contract or address
    opts: UpgradeOptions = {},
  ) {
    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);


    const data = encodeCall(ImplFactory, opts.call);
    if (opts.kind === undefined) {
      opts.kind = 'beacon'; // TODO
    }
    const { kind } = { kind: opts.kind };
    
    if (await manifest.getAdmin()) {
      logWarning(`A proxy admin was previously deployed on this network`, [
        `This is not natively used with the current kind of proxy ('beacon').`,
        `Changes to the admin will have no effect on this new proxy.`,
      ]);
    }

    let proxyDeployment: Required<ProxyDeployment & DeployTransaction>;
    const BeaconProxyFactory = await getBeaconProxyFactory(hre, ImplFactory.signer);
    proxyDeployment = Object.assign({ kind }, await deploy(BeaconProxyFactory, beacon.address, data));

    await manifest.addProxy(proxyDeployment);

    const inst = ImplFactory.attach(proxyDeployment.address);
    // @ts-ignore Won't be readonly because inst was created through attach.
    inst.deployTransaction = proxyDeployment.deployTransaction;
    return inst;
  };

  function encodeCall(factory: ContractFactory, call: UpgradeOptions['call']): string | undefined {
    if (!call) {
      return undefined;
    }
  
    if (typeof call === 'string') {
      call = { fn: call };
    }
  
    return factory.interface.encodeFunctionData(call.fn, call.args ?? []);
  }
}
