import { getImplementationAddressFromProxy, UpgradesError } from '@openzeppelin/upgrades-core';
import { LoadProxyUnsupportedError } from '@openzeppelin/upgrades-core/src/usage-error';

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

  const implAddress = await getImplementationAddressFromProxy(provider, proxyAddress);
  if (implAddress === undefined) {
    throw new LoadProxyUnsupportedError(proxyAddress);
  }

  const contractInterface = await getInterfaceFromManifest(provider, proxy, implAddress);
  if (contractInterface === undefined) {
    throw new UpgradesError(
      `Implementation ${implAddress} was not found in the network manifest.`,
      () =>
        `Create an instance of the implementation contract at the proxy address instead. For example, if your Truffle contract object is called MyContract, use MyContract.at(${proxyAddress})`,
    );
  }

  // TODO make this part of the interface
  return (contractInterface as any).at(proxyAddress);
}
