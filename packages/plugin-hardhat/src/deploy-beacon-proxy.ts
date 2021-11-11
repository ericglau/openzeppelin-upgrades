import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ContractFactory, Contract, ethers, Signer } from 'ethers';

import { Manifest, logWarning, ProxyDeployment, getBeaconAddress } from '@openzeppelin/upgrades-core';

import {
  DeployOptions,
  deploy,
  DeployTransaction,
  getBeaconProxyFactory,
  ContractAddressOrInstance,
  getContractAddress,
  getIBeaconFactory,
} from './utils';
import { getInitializerData } from './deploy-proxy';
import { Interface } from '@ethersproject/abi';

export interface DeployBeaconProxyFunction {
  (
    beacon: ContractAddressOrInstance,
    ImplFactoryOrSigner: ContractFactory | Signer,
    args?: unknown[],
    opts?: DeployOptions,
  ): Promise<Contract>;
  (
    beacon: ContractAddressOrInstance,
    ImplFactoryOrSigner: ContractFactory | Signer,
    opts?: DeployOptions,
  ): Promise<Contract>;
}

export function makeDeployBeaconProxy(hre: HardhatRuntimeEnvironment): DeployBeaconProxyFunction {
  return async function deployBeaconProxy(
    beacon: ContractAddressOrInstance,
    ImplFactoryOrSigner: ContractFactory | Signer,
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
    let contractInterface: Interface | undefined;
    try {
      const currentImplAddress = await getImplAddressFromBeaconAddress(hre, getSigner(ImplFactoryOrSigner), beaconAddress);
      contractInterface = await getInterfaceFromManifest(hre, currentImplAddress);
    } catch (e: any) {
      // error expected if the current implementation was not found in manifest
    }
    if (contractInterface === undefined) {
      if (ImplFactoryOrSigner instanceof ContractFactory) {
        contractInterface = ImplFactoryOrSigner.interface;
      } else {
        throw new Error(
          // TODO get the impl address and change message?
          `The implementation for the beacon at address ${beaconAddress} was not found in the network manifest. Call deployBeaconProxy() with a contract factory for the beacon's current implementation.`,
        );
      }
    }

    const data = getInitializerData(contractInterface, args, opts.initializer);

    if (await manifest.getAdmin()) {
      logWarning(`A proxy admin was previously deployed on this network`, [
        `This is not natively used with the current kind of proxy ('beacon').`,
        `Changes to the admin will have no effect on this new proxy.`,
      ]);
    }

    const BeaconProxyFactory = await getBeaconProxyFactory(
      hre,
      getSigner(ImplFactoryOrSigner),
    );
    const proxyDeployment: Required<ProxyDeployment & DeployTransaction> = Object.assign(
      { kind: opts.kind },
      await deploy(BeaconProxyFactory, beaconAddress, data),
    );

    await manifest.addProxy(proxyDeployment);

    let inst: Contract;
    if (ImplFactoryOrSigner instanceof ContractFactory) {
      inst = ImplFactoryOrSigner.attach(proxyDeployment.address);
    } else {
      inst = new Contract(proxyDeployment.address, contractInterface, ImplFactoryOrSigner);
    }
    // @ts-ignore Won't be readonly because inst was created through attach.
    inst.deployTransaction = proxyDeployment.deployTransaction;
    return inst;
  };
}

// TODO put this in a common library
export async function getInterfaceFromManifest(hre: HardhatRuntimeEnvironment, implAddress: string) : Promise<ethers.utils.Interface | undefined> {
  const { provider } = hre.network;
  const manifest = await Manifest.forNetwork(provider);

  const implDeployment = await manifest.getDeploymentFromAddress(implAddress);
  if (implDeployment.abi === undefined) {
    return undefined;
  }
  return new ethers.utils.Interface(implDeployment.abi);
}

// TODO put this in a common library
export async function getImplAddressFromBeaconAddress(hre: HardhatRuntimeEnvironment, signer: ethers.Signer | undefined, beaconAddress: string) {
  const IBeaconFactory = await getIBeaconFactory(hre, signer);
  const beaconContract = IBeaconFactory.attach(beaconAddress);
  const currentImplAddress = await beaconContract.implementation();
  return currentImplAddress;
}

// TODO make this a type
function getSigner(ImplFactoryOrSigner: ContractFactory | Signer) {
  return ImplFactoryOrSigner instanceof ContractFactory? ImplFactoryOrSigner.signer : ImplFactoryOrSigner;
}