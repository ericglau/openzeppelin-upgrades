import { getImplementationAddressFromProxy, UpgradesError } from '@openzeppelin/upgrades-core';

import { ContractClass, ContractInstance, wrapProvider, withDefaults } from './utils';
import { getInterfaceFromManifest } from './utils/impl-interface';

export async function loadProxy(proxy: ContractClass): Promise<ContractInstance> {
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

  // TODO make this part of the interface
  return (contractInterface as any).at(proxyAddress);
}
