import {
  DeploymentNotFound,
  EIP1967BeaconNotFound,
  EIP1967ImplementationNotFound,
  getBeaconAddress,
  getImplementationAddress,
  getImplementationAddressFromBeacon1,
  Manifest,
} from '@openzeppelin/upgrades-core';
import { ContractFactory, utils } from 'ethers';
import { EthereumProvider, HardhatRuntimeEnvironment } from 'hardhat/types';
import { getIBeaconFactory } from '.';

// /**
//  * Gets the implementation address from a Beacon.
//  *
//  * @returns the implementation address.
//  */
// export async function getImplementationAddressFromBeacon(hre: HardhatRuntimeEnvironment, beaconAddress: string) {
//   /*const IBeaconFactory = await getIBeaconFactory(hre);
//   //const call = encodeCall(IBeaconFactory, "implementation");
  
//   const beaconContract = IBeaconFactory.attach(beaconAddress);
//   const currentImplAddress = await beaconContract.implementation();
//   */
//  const { provider } = hre.network;
//   const currentImplAddress = await getImplementationAddressFromBeacon1(provider, beaconAddress);
//   return currentImplAddress;
// }

// function encodeCall(factory: ContractFactory, call: string): string | undefined {
//   return factory.interface.encodeFunctionData("implementation", []);
// }





/**
 * Gets the implementation interface from the manifest.
 *
 * @returns a Promise with the interface, or undefined the implementation interface cannot be found in the manifest.
 */
export async function getInterfaceFromManifest(
  hre: HardhatRuntimeEnvironment,
  implAddress: string,
): Promise<utils.Interface | undefined> {
  const { provider } = hre.network;
  const manifest = await Manifest.forNetwork(provider);
  try {
    const implDeployment = await manifest.getDeploymentFromAddress(implAddress);
    if (implDeployment.abi === undefined) {
      return undefined;
    }
    return new utils.Interface(implDeployment.abi);
  } catch (e: any) {
    if (e instanceof DeploymentNotFound) {
      return undefined;
    } else {
      throw e;
    }
  }
}
