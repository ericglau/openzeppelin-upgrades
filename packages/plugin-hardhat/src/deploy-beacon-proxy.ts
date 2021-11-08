import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ContractFactory, Contract, ethers } from 'ethers';

import { Manifest, logWarning, ProxyDeployment } from '@openzeppelin/upgrades-core';

import {
  DeployOptions,
  deploy,
  DeployTransaction,
  getBeaconProxyFactory,
  ContractAddressOrInstance,
  getContractAddress,
} from './utils';
import { getInitializerData } from './deploy-proxy';
import { FormatTypes } from '@ethersproject/abi';

export interface DeployBeaconProxyFunction {
  (ImplFactory: ContractFactory, beacon: ContractAddressOrInstance, args?: unknown[], opts?: DeployOptions): Promise<Contract>;
  (ImplFactory: ContractFactory, beacon: ContractAddressOrInstance, opts?: DeployOptions): Promise<Contract>;
}

export function makeDeployBeaconProxy(hre: HardhatRuntimeEnvironment): DeployBeaconProxyFunction {
  return async function deployBeaconProxy(
    ImplFactory: ContractFactory,
    beacon: ContractAddressOrInstance,
    args: unknown[] | DeployOptions = [],
    opts: DeployOptions = {},
  ) {
    if (!Array.isArray(args)) {
      opts = args;
      args = [];
    }

    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

    opts.kind = 'beacon';

    const beaconAddress = getContractAddress(beacon);
    const data = getInitializerDataTEST(ImplFactory, args, opts.initializer);
    
    if (await manifest.getAdmin()) {
      logWarning(`A proxy admin was previously deployed on this network`, [
        `This is not natively used with the current kind of proxy ('beacon').`,
        `Changes to the admin will have no effect on this new proxy.`,
      ]);
    }

    let proxyDeployment: Required<ProxyDeployment & DeployTransaction>;
    const BeaconProxyFactory = await getBeaconProxyFactory(hre, ImplFactory.signer);
    proxyDeployment = Object.assign({ kind: opts.kind }, await deploy(BeaconProxyFactory, beaconAddress, data));

    await manifest.addProxy(proxyDeployment);

    const inst = ImplFactory.attach(proxyDeployment.address);
    // @ts-ignore Won't be readonly because inst was created through attach.
    inst.deployTransaction = proxyDeployment.deployTransaction;
    return inst;
  };
}

export function getInitializerDataTEST(ImplFactory: ContractFactory, args: unknown[], initializer?: string | false): string {
  if (initializer === false) {
    return '0x';
  }

  const allowNoInitialization = initializer === undefined && args.length === 0;
  initializer = initializer ?? 'initialize';

  try {
    const abi = ImplFactory.interface.format(FormatTypes.json);

    const contractInterface = new ethers.utils.Interface(abi);

    const fragment = contractInterface.getFunction(initializer);
    return contractInterface.encodeFunctionData(fragment, args);
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (allowNoInitialization && e.message.includes('no matching function')) {
        return '0x';
      }
    }
    throw e;
  }
}