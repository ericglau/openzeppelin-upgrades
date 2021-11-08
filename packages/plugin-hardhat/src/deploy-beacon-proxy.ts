import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ContractFactory, Contract, ethers } from 'ethers';

import { Manifest, logWarning, ProxyDeployment, DeploymentNotFound } from '@openzeppelin/upgrades-core';

import {
  DeployOptions,
  deploy,
  DeployTransaction,
  getBeaconProxyFactory,
  ContractAddressOrInstance,
  getContractAddress,
} from './utils';
import { getInitializerData } from './deploy-proxy';
import { FormatTypes, Interface } from '@ethersproject/abi';

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
    let contractInterface: Interface;
    try {
      contractInterface = await getBeaconInterfaceFromManifest(hre, beaconAddress);
    } catch (e: any) {
      contractInterface = ImplFactory.interface;
    }
    const data = getInitializerData(contractInterface, args, opts.initializer);
    
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

async function getBeaconInterfaceFromManifest(hre: HardhatRuntimeEnvironment, beaconAddress: string) {
  const { provider } = hre.network;
  const manifest = await Manifest.forNetwork(provider);
  const beaconDeployment = await manifest.getBeaconFromAddress(beaconAddress);
  return new ethers.utils.Interface(beaconDeployment.abi);
}
