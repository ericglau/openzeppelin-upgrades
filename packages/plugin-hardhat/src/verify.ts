import { resolveEtherscanApiKey } from '@nomiclabs/hardhat-etherscan/dist/src/resolveEtherscanApiKey';
import { toCheckStatusRequest, toVerifyRequest } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanVerifyContractRequest';
import { delay, getVerificationStatus, verifyContract } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanService';
import { getProxyFactory } from './utils/factories';

import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';

import { Manifest, getTransactionByHash, getImplementationAddress, EIP1967ImplementationNotFound, getBeaconAddress, getImplementationAddressFromBeacon, EIP1967BeaconNotFound, UpgradesError } from '@openzeppelin/upgrades-core';
import { EthereumProvider, HardhatRuntimeEnvironment, RunSuperFunction } from 'hardhat/types';
import { EtherscanConfig } from '@nomiclabs/hardhat-etherscan/dist/src/types';

const buildInfo = require('@openzeppelin/upgrades-core/artifacts/build-info.json');

async function getTransactionHashFromManifest(provider: EthereumProvider, proxyAddress: string) {
  const manifest = await Manifest.forNetwork(provider);
  const { proxies } = await manifest.read();
  for (const proxy of proxies) {
    if (proxyAddress === proxy.address) {
      return proxy.txHash;
    }
  }
}

/**
 * Verifies the contract at an address. If the address is a proxy, verifies the proxy and associated proxy contracts, 
 * as well as the implementation. If the address is not a proxy, calls hardhat-etherscan's verify function directly.
 * 
 * @param args 
 * @param hre 
 * @param runSuper 
 * @returns 
 */
export async function verify(args: any, hre: HardhatRuntimeEnvironment, runSuper: RunSuperFunction<any>) {
  const provider = hre.network.provider;
  let addresses: Addresses = await getRelatedAddresses(provider, args.address);

  if (addresses.impl === undefined) {
    // does not look like a proxy, so just verify directly
    return hardhatVerify(args.address);
  } else {
    const proxyAddress = args.address;
    console.log(`Detected proxy ${proxyAddress.impl}`);

    console.log(`Verifying implementation ${addresses.impl}`);
    hardhatVerify(addresses.impl); // TODO if already verified, continue
    console.log(`Implementation ${addresses.impl} verified!`);
  
    let etherscanApi: EtherscanAPI = await getEtherscanAPIFields(hre);
  
    const txHash = await getTransactionHashFromManifest(hre.network.provider, proxyAddress);
    if (txHash === undefined) {
      // TODO get constructor args from user input
      throw new UpgradesError("Define constructor arguments");
    }
    console.log("Got tx hash: " + txHash);
  
    const uupsProxyFactory = await getProxyFactory(hre);
    const creationCode = uupsProxyFactory.bytecode
    console.log("UUPS creation code: " + creationCode);
  
    const tx = await getTransactionByHash(hre.network.provider, txHash);
    const txInput = tx?.input;
    console.log("TX deploy code: " + txInput);
  
    let constructorArguments;
    if (txInput !== undefined && txInput.startsWith(creationCode)) {
      constructorArguments = txInput.substring(creationCode.length);
      console.log("Constructor args: " + constructorArguments);
    } else {
      // TODO get constructor args from user input
      return;
    }
  
    const params = {
      apiKey: etherscanApi.key,
      contractAddress: proxyAddress,
      sourceCode: JSON.stringify(buildInfo.input),
      sourceName: ERC1967Proxy.sourceName,
      contractName: ERC1967Proxy.contractName,
      compilerVersion:  `v${buildInfo.solcLongVersion}`,
      constructorArguments: constructorArguments,
    }
    
    const request = toVerifyRequest(params);
    const response = await verifyContract(etherscanApi.endpoints.urls.apiURL, request);
    const pollRequest = toCheckStatusRequest({
      apiKey: etherscanApi.key,
      guid: response.message,
    });
  
    // Compilation is bound to take some time so there's no sense in requesting status immediately.
    await delay(700);
    const verificationStatus = await getVerificationStatus(
      etherscanApi.endpoints.urls.apiURL,
      pollRequest
    );
  
    console.log("Verification STATUS : \n"+JSON.stringify(verificationStatus));
  
    if (
      verificationStatus.isVerificationFailure() ||
      verificationStatus.isVerificationSuccess()
    ) {
      console.log(verificationStatus.message);
    }
  }

  function hardhatVerify(address: string) {
    return runSuper({ ...args, address });
  }
}

async function getEtherscanAPIFields(hre: HardhatRuntimeEnvironment): Promise<EtherscanAPI> {

  const endpoints = await hre.run("verify:get-etherscan-endpoint");
  console.log(`Etherscan endpoint urls: ${JSON.stringify(endpoints)}`);

  const etherscanConfig: EtherscanConfig = (hre.config as any).etherscan;

  console.log(`Etherscan config: ${JSON.stringify(etherscanConfig)}`); // TODO remove

  const apiKey = resolveEtherscanApiKey(
    etherscanConfig,
    endpoints.network
  );

  return { key: apiKey, endpoints };
}

async function getRelatedAddresses(provider: EthereumProvider, inputAddress: string) {
  let addresses: Addresses = {};
  try {
    addresses.impl = await getImplementationAddress(provider, inputAddress);
  } catch (e: any) {
    if (e instanceof EIP1967ImplementationNotFound) {
      try {
        addresses.beacon = await getBeaconAddress(provider, inputAddress);
        addresses.impl = await getImplementationAddressFromBeacon(provider, addresses.beacon);
      } catch (e: any) {
        if (e instanceof EIP1967BeaconNotFound) {
          return addresses;
        } else {
          throw e;
        }
      }
    } else {
      throw e;
    }
  }
  return addresses;
}

interface Addresses {
  impl?: string;
  beacon?: string;
  admin?: string; // TODO
}

interface EtherscanAPI {
  key: string;
  endpoints: any;
}