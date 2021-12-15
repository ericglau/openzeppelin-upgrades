import { ContractClass, deployProxyImpl, Options, ContractAddressOrInstance, getContractAddress } from './utils';

export async function prepareUpgrade(
  proxy: ContractAddressOrInstance,
  Contract: ContractClass,
  opts: Options = {},
): Promise<string> {
  const proxyAddress = getContractAddress(proxy);
  const { impl } = await deployProxyImpl(Contract, opts, proxyAddress);
  return impl;
}
