import { resolveEtherscanApiKey } from '@nomiclabs/hardhat-etherscan/dist/src/resolveEtherscanApiKey';
import { toCheckStatusRequest, toVerifyRequest } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanVerifyContractRequest';
import { delay, getVerificationStatus, verifyContract } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanService';

import { getTransactionByHash, getImplementationAddress, EIP1967ImplementationNotFound, getBeaconAddress, getImplementationAddressFromBeacon, EIP1967BeaconNotFound, UpgradesError, getAdminAddress } from '@openzeppelin/upgrades-core';
import { EthereumProvider, HardhatRuntimeEnvironment, RunSuperFunction } from 'hardhat/types';
import { EtherscanConfig } from '@nomiclabs/hardhat-etherscan/dist/src/types';

import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';
import BeaconProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json';
import UpgradeableBeacon from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import TransparentUpgradeableProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json';
import ProxyAdmin from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json';

import { keccak256 } from 'ethereumjs-util';
import { Dispatcher } from "undici";
import BN from 'bn.js';
import { isEmptySlot } from '@openzeppelin/upgrades-core/src/eip-1967';

const buildInfo = require('@openzeppelin/upgrades-core/artifacts/build-info.json');

interface ContractEventMapping {
  contractJson: ContractArtifactJson,
  event: string
}

interface ContractTypes {
  erc1967proxy: ContractEventMapping,
  beaconProxy: ContractEventMapping,
  upgradeableBeacon: ContractEventMapping,
  transparentUpgradeableProxy: ContractEventMapping,
  proxyAdmin: ContractEventMapping,
}

const contractEvents: ContractTypes = {
  erc1967proxy: { contractJson: ERC1967Proxy, event: 'Upgraded(address)'},
  beaconProxy: { contractJson: BeaconProxy, event: 'BeaconUpgraded(address)'},
  upgradeableBeacon: { contractJson: UpgradeableBeacon, event: 'OwnershipTransferred(address,address)'},
  transparentUpgradeableProxy: { contractJson: TransparentUpgradeableProxy, event: 'AdminChanged(address,address)'},
  proxyAdmin: { contractJson: ProxyAdmin, event: 'OwnershipTransferred(address,address)'},
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

  // TODO log as debug
  console.log(`Addresses: ${JSON.stringify(addresses)}`);

/*
1. check if logic contract slot has content
2a. if yes, check transparent
  2ai. if yes, check admin
  2aii. else, check uups
2b. else, check beacon
*/




  if (addresses.impl === undefined) {
    // does not look like a proxy, so just verify directly
    return hardhatVerify(args.address);
  } else {
    const proxyAddress = args.address;
    console.log(`Detected proxy ${proxyAddress}`);

    console.log(`Verifying implementation ${addresses.impl}`);
    await verifyImplementation(hardhatVerify, addresses.impl);
  
    let etherscanApi: EtherscanAPI = await getEtherscanAPI(hre);

    if (addresses.beacon !== undefined) {
      // it is a beacon proxy
      console.log(`Verifying beacon proxy ${proxyAddress}`);
      await verifyContractWithEvent(hre, etherscanApi, proxyAddress, BeaconProxy, 'BeaconUpgraded(address)');

      console.log(`Verifying beacon ${addresses.beacon}`);
      await verifyContractWithEvent(hre, etherscanApi, addresses.beacon, UpgradeableBeacon, 'OwnershipTransferred(address,address)');
    } else {
      console.log(`Checking if Transparent ${proxyAddress}`);
      try {
        await verifyContractWithEvent(hre, etherscanApi, proxyAddress, TransparentUpgradeableProxy, 'AdminChanged(address,address)');
      } catch (e: any) {
        if (e instanceof EventNotFound) {
          console.log(`Checking if UUPS ${proxyAddress}`);
          await verifyContractWithEvent(hre, etherscanApi, proxyAddress, ERC1967Proxy, 'Upgraded(address)');
        }
      }

      if (addresses.admin !== undefined) {
        // TODO check if admin is an EOA

        console.log(`Verifying admin: ${addresses.admin}`);
        await verifyContractWithEvent(hre, etherscanApi, addresses.admin, ProxyAdmin, 'OwnershipTransferred(address,address)');
      }
    }
  }

  async function hardhatVerify(address: string) {
    return await runSuper({ ...args, address });
  }
}

class EventNotFound extends UpgradesError {}

async function verifyImplementation(hardhatVerify: (address: string) => Promise<any>, implAddress: string) {
  try {
    await hardhatVerify(implAddress);
    console.log(`Implementation ${implAddress} verified!`);
  } catch (e: any) {
    if (e.message.toLowerCase().includes('already verified')) {
      console.log(`Implementation ${implAddress} already verified.`);
    } else {
      throw e;
    }
  }
}

async function verifyContractWithEvent(hre: HardhatRuntimeEnvironment, etherscanApi: EtherscanAPI, address: string, contractJson: ContractArtifactJson, creationEvent: string) {
  console.log(`Verifying contract ${contractJson.contractName} at ${address}`);

  // TODO if address is EOA, this will fail
  const txHash = await getEtherscanTxCreationHash(address, creationEvent, etherscanApi);
  if (txHash === undefined) {
    // TODO see how to handle this
    throw new EventNotFound("txhash not found " + txHash);
  }

  const tx = await getTransactionByHash(hre.network.provider, txHash);
  if (tx === null) {
    // TODO
    throw new Error("txhash not found " + txHash);
  }
  const txInput = tx.input;
  console.log("TX deploy code: " + txInput);

  const constructorArguments = inferConstructorArgs(txInput, contractJson.bytecode);
  if (constructorArguments === undefined) {
    // TODO
    throw new Error("constructor args not found");
  }
  console.log("verifying contract: " + address);
  await verifyProxy(etherscanApi, address, constructorArguments, contractJson);
}

export async function callEtherscanApi(
  etherscanApi: EtherscanAPI,
  params: any
): Promise<EtherscanResponse> {
  const { request } = await import("undici");

  const parameters = new URLSearchParams({ ...params, apikey: etherscanApi.key });
  const method: Dispatcher.HttpMethod = "POST";
  const requestDetails = {
    method,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters.toString(),
  };

  let response: Dispatcher.ResponseData;
  try {
    response = await request(etherscanApi.endpoints.urls.apiURL, requestDetails);
    //console.log("ETHERSCAN LOGS RESPONSE " + JSON.stringify(response));
    //console.log("ETHERSCAN LOGS RESPONSE BODY " + await response.body.text());
    console.log("getting responsebody");
    const responseBody = await response.body.json();
    console.log("got responsebody");
    console.log("ETHERSCAN RESPONSE BODY AS JSON " + JSON.stringify(responseBody));
    return responseBody;

  } catch (error: any) {
    throw new UpgradesError(
      `Failed to get etherscan api response ${error}`
    );
  }

//   if (!(response.statusCode >= 200 && response.statusCode <= 299)) {
//     // This could be always interpreted as JSON if there were any such guarantee in the Etherscan API.
//     const responseText = await response.body.text();
//     throw new NomicLabsHardhatPluginError(
//       pluginName,
//       `Failed to send contract verification request.
// Endpoint URL: ${url}
// The HTTP server response is not ok. Status code: ${response.statusCode} Response text: ${responseText}`
//     );
//   }

//   const etherscanResponse = new EtherscanResponse(await response.body.json());

//   if (etherscanResponse.isBytecodeMissingInNetworkError()) {
//     throw new NomicLabsHardhatPluginError(
//       pluginName,
//       `Failed to send contract verification request.
// Endpoint URL: ${url}
// Reason: The Etherscan API responded that the address ${req.contractaddress} does not have bytecode.
// This can happen if the contract was recently deployed and this fact hasn't propagated to the backend yet.
// Try waiting for a minute before verifying your contract. If you are invoking this from a script,
// try to wait for five confirmations of your contract deployment transaction before running the verification subtask.`
//     );
//   }

//   if (!etherscanResponse.isOk()) {
//     throw new NomicLabsHardhatPluginError(
//       pluginName,
//       etherscanResponse.message
//     );
//   }

  // return etherscanResponse;
}

interface EtherscanResponse {
  result: any
}

export async function getEtherscanTxCreationHash(
  address: string,
  topic: string,
  etherscanApi : EtherscanAPI
): Promise<any> {

  const params = {
    module: 'logs',
    action: 'getLogs',
    fromBlock: '0',
    toBlock: 'latest',
    address: address,
    topic0: '0x' + keccak256(Buffer.from(topic)).toString('hex'),
  }

  const responseBody = await callEtherscanApi(etherscanApi, params);

  if (responseBody.result === undefined || responseBody.result[0] === undefined) {
    console.log("getlogs API returned with no result")
    return undefined;
  }

  // TODO if call failed e.g. trying to get txhash from EOA, result[0] will be undefined
  const txHash = responseBody.result[0].transactionHash;
  if (txHash !== undefined) {
    console.log("Found tx hash! " + txHash);
    return txHash;
  } else {
    // TODO
    throw new Error("Failed to find tx hash for creation of address " + address);
  }

}


interface ContractArtifactJson { 
  contractName: string;
  sourceName: string;
  abi: any;
  bytecode: any;
}

async function verifyProxy(etherscanApi: EtherscanAPI, proxyAddress: any, constructorArguments: string, contractImport: ContractArtifactJson) {
  console.log(`Verifying proxy ${proxyAddress} with constructor args ${constructorArguments}...`);

  const params = {
    apiKey: etherscanApi.key,
    contractAddress: proxyAddress,
    sourceCode: JSON.stringify(buildInfo.input),
    sourceName: contractImport.sourceName,
    contractName: contractImport.contractName,
    compilerVersion: `v${buildInfo.solcLongVersion}`,
    constructorArguments: constructorArguments,
  };

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

    if (verificationStatus.isVerificationFailure() ||
      verificationStatus.isVerificationSuccess()) {
      console.log(`Verification status for ${proxyAddress}: ${verificationStatus.message}`);
    }
  } catch (e: any) {
    console.log(`Verification for ${proxyAddress} failed: ${e.message}`);
  }
}

/**
 * Gets the constructor args from the given transaction input and creation code.
 *  
 * @param txInput The transaction input that was used to deploy the contract.
 * @param creationCode The contract creation code.
 * @returns the encoded constructor args, or undefined if txInput does not start with the creationCode.
 */
function inferConstructorArgs(txInput: string, creationCode: string) {
  if (txInput.startsWith(creationCode)) {
    console.log(`Returning constructor args ${txInput.substring(creationCode.length)}`);
    return txInput.substring(creationCode.length);
  } else {
    console.log(`txinput ${txInput} does not start with creation code ${creationCode}`);
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

/**
 * Gets the related addresses for a proxy: implementation, beacon, proxy admin.
 * 
 * According ERC1967, only consider the beacon slot if logic contract slot is empty.
 * e.g.
 *  - if UUPS or Tranparent proxy, return { impl, admin? }
 *  - else if Beacon, return { impl, beacon, admin? }
 *  - else return empty object
 * 
 * @param provider 
 * @param inputAddress 
 * @returns 
 */
async function getRelatedAddresses(provider: EthereumProvider, inputAddress: string) {
  let addresses: Addresses = {};
  try {
    addresses.impl = await getImplementationAddress(provider, inputAddress);

    const admin = await getAdminAddress(provider, inputAddress);
    console.log("Admin " + admin + " is zero? " + isEmptySlot(admin));
    if (!isEmptySlot(admin)) {
      addresses.admin = admin;
    }
  } catch (e: any) {
    if (e instanceof EIP1967ImplementationNotFound) {
      try {
        addresses.beacon = await getBeaconAddress(provider, inputAddress);
        addresses.impl = await getImplementationAddressFromBeacon(provider, addresses.beacon);
      } catch (e: any) {
        if (e instanceof EIP1967BeaconNotFound) {
          // not an ERC1967 compatible proxy or beacon
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
  admin?: string;
}

interface EtherscanAPI {
  key: string;
  endpoints: any;
}
