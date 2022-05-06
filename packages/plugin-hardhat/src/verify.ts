import { resolveEtherscanApiKey } from '@nomiclabs/hardhat-etherscan/dist/src/resolveEtherscanApiKey';
import { toCheckStatusRequest, toVerifyRequest } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanVerifyContractRequest';
import { delay, getVerificationStatus, verifyContract } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanService';
import { getProxyFactory } from './utils/factories';

import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';

import { Manifest, getTransactionByHash, getImplementationAddress, EIP1967ImplementationNotFound, getBeaconAddress, getImplementationAddressFromBeacon, EIP1967BeaconNotFound, UpgradesError } from '@openzeppelin/upgrades-core';
import { EthereumProvider, HardhatRuntimeEnvironment, RunSuperFunction } from 'hardhat/types';
import { EtherscanConfig } from '@nomiclabs/hardhat-etherscan/dist/src/types';
import { NomicLabsHardhatPluginError } from 'hardhat/plugins';

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
  
    let etherscanApi: EtherscanAPI = await getEtherscanAPI(hre);
  
    let constructorArguments = await getConstructorArgs(hre, proxyAddress);
  
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
    try {
      const verificationStatus = await getVerificationStatus(
        etherscanApi.endpoints.urls.apiURL,
        pollRequest
      );
      
      if (
        verificationStatus.isVerificationFailure() ||
        verificationStatus.isVerificationSuccess()
      ) {
        console.log(`Verification status for ${proxyAddress}: ${verificationStatus.message}`);
      }
    } catch (e: any) {
      console.log(`Verification for ${proxyAddress} failed: ${e.message}`);
    }
    
  }

  function hardhatVerify(address: string) {
    return runSuper({ ...args, address });
  }
}

async function getConstructorArgs(hre: HardhatRuntimeEnvironment, proxyAddress: any) {
  const txHash = await getTransactionHashFromManifest(hre.network.provider, proxyAddress);
  if (txHash === undefined) {
    // TODO get constructor args from user input
    throw new UpgradesError("Define constructor arguments");
  }
  console.log("Got tx hash: " + txHash);

  // Determine contract based on whether transaction deployment code starts with the contract's creation code 

  const uupsProxyFactory = await getProxyFactory(hre);
  const creationCode = uupsProxyFactory.bytecode;
  console.log("UUPS creation code: " + creationCode);

  const tx = await getTransactionByHash(hre.network.provider, txHash);
  const txInput = tx?.input;
  console.log("TX deploy code: " + txInput);

  return await inferConstructorArgs(txHash, creationCode);
}

/**
 * Gets the constructor args from the given transaction input and creation code.
 *  
 * @param txInput The transaction input that was used to deploy the contract.
 * @param creationCode The contract creation code.
 * @returns the encoded constructor args, or undefined if txInput does not start with the creationCode.
 */
async function inferConstructorArgs(txInput: string, creationCode: string) {
  if (txInput.startsWith(creationCode)) {
    return txInput.substring(creationCode.length);
  } else {
    return undefined;
  }
}

async function getEtherscanAPI(hre: HardhatRuntimeEnvironment): Promise<EtherscanAPI> {

  const endpoints = await hre.run("verify:get-etherscan-endpoint");
  console.log(`Etherscan endpoint urls: ${JSON.stringify(endpoints)}`);

  const etherscanConfig: EtherscanConfig = (hre.config as any).etherscan;
  console.log(`Etherscan config: ${JSON.stringify(etherscanConfig)}`); // TODO remove

  const key = resolveEtherscanApiKey(
    etherscanConfig,
    endpoints.network
  );

  return { key, endpoints };
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