import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Contract, Signer } from 'ethers';

import { ContractAddressOrInstance, getContractAddress } from './utils';
import { getImplementationAddressFromProxy, getInterfaceFromManifest } from './utils/impl-address';

export interface LoadProxyFunction {
  (proxy: Contract, signer?: Signer): Promise<Contract>;
  (proxy: ContractAddressOrInstance, signer: Signer): Promise<Contract>;
}

export function makeLoadProxy(hre: HardhatRuntimeEnvironment): LoadProxyFunction {
  return async function loadProxy(proxy: ContractAddressOrInstance | Contract, signer?: Signer) {
    const { provider } = hre.network;

    const proxyAddress = getContractAddress(proxy);

    const implAddress = await getImplementationAddressFromProxy(provider, proxyAddress, hre, proxy, signer);
    const contractInterface = await getInterfaceFromManifest(hre, implAddress);
    if (contractInterface === undefined) {
      throw new Error(
        `The implementation at address ${implAddress} was not found in the network manifest. Use the implementation's contract factory to attach to the proxy address instead.`,
      );
    }

    if (signer === undefined && proxy instanceof Contract) {
      signer = proxy.signer;
    }
    return new Contract(proxyAddress, contractInterface, signer);
  };
}
