import { DeploymentNotFound, EthereumProvider, Manifest } from '@openzeppelin/upgrades-core';
import { ContractClass, getTruffleDefaults, getTruffleProvider, TruffleContract } from '.';

/**
 * Gets the implementation interface from the manifest.
 *
 * @returns a Promise with the interface, or undefined the implementation interface cannot be found in the manifest.
 */
export async function getInterfaceFromManifest(
  provider: EthereumProvider,
  template: ContractClass | undefined,
  implAddress: string,
): Promise<ContractClass | undefined> {
  const manifest = await Manifest.forNetwork(provider);
  try {
    const implDeployment = await manifest.getDeploymentFromAddress(implAddress);
    if (implDeployment.abi === undefined) {
      return undefined;
    }
    return getContract(template, implDeployment.abi);
  } catch (e: any) {
    if (e instanceof DeploymentNotFound) {
      return undefined;
    } else {
      throw e;
    }
  }
}

function getContract(template: ContractClass | undefined, abi: string[]) {
  const contract = TruffleContract({
    abi: abi
  });
  contract.setProvider(template?.currentProvider ?? getTruffleProvider());
  contract.defaults(template?.class_defaults ?? getTruffleDefaults());
  contract.detectNetwork();
  return contract;
}