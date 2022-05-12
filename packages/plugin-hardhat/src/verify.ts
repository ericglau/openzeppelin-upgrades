import { resolveEtherscanApiKey } from '@nomiclabs/hardhat-etherscan/dist/src/resolveEtherscanApiKey';
import { toCheckStatusRequest, toVerifyRequest } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanVerifyContractRequest';
import { delay, getVerificationStatus, verifyContract } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanService';
import { getBeaconProxyFactory, getProxyFactory, getTransparentUpgradeableProxyFactory } from './utils/factories';

import { Manifest, getTransactionByHash, getImplementationAddress, EIP1967ImplementationNotFound, getBeaconAddress, getImplementationAddressFromBeacon, EIP1967BeaconNotFound, UpgradesError } from '@openzeppelin/upgrades-core';
import { EthereumProvider, HardhatRuntimeEnvironment, RunSuperFunction } from 'hardhat/types';
import { EtherscanConfig } from '@nomiclabs/hardhat-etherscan/dist/src/types';
import { ContractFactory } from 'ethers';

import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';
import BeaconProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json';
import UpgradeableBeacon from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import TransparentUpgradeableProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json';
import ProxyAdmin from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json';

import { keccak256 } from 'ethereumjs-util';
import { Dispatcher } from "undici";

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
  console.log(`Addresses: ${JSON.stringify(addresses)}`);

  if (addresses.impl === undefined) {
    // does not look like a proxy, so just verify directly
    return hardhatVerify(args.address);
  } else {
    const proxyAddress = args.address;
    console.log(`Detected proxy ${proxyAddress}`);

    console.log(`Verifying implementation ${addresses.impl}`);
    try {
      await hardhatVerify(addresses.impl);
      console.log(`Implementation ${addresses.impl} verified!`);
    } catch (e: any) {
      if (e.message.includes('already verified')) {
        console.log(`Implementation ${addresses.impl} already verified.`);
      } else {
        throw e;
      }
    }
  
    let etherscanApi: EtherscanAPI = await getEtherscanAPI(hre);

    if (addresses.beacon !== undefined) {
      // it is a beacon proxy
      console.log(`Beacon: verifying beacon proxy ${proxyAddress}`);

      let constructorArguments = await getConstructorArgs(hre, await getFactory(hre, BeaconProxy), proxyAddress);
      if (constructorArguments === undefined) {
        console.log("The proxy contract bytecode differs than the version defined in the OpenZeppelin Upgrades Plugin. Verifying directly instead...");
        await hardhatVerify(args.address);
      } else {
        await verifyProxy(etherscanApi, proxyAddress, constructorArguments, BeaconProxy);
      }

      console.log(`Beacon: verifying beacon itself ${addresses.beacon}`);

      const txHash = await getEtherscanTxCreationHash('https://api-kovan.etherscan.io/api', addresses.beacon, 'OwnershipTransferred(address,address)', etherscanApi.key);

      //------
      
// Get txhash using etherscan api
//https://api-kovan.etherscan.io/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=0xE14a4fc7b96E8a3B701fd3D821bDcE8f8c0AaeF4&topic0=0x1cf3b03a6cf19fa2baba4df148e9dcabedea7f8a5c07840e207e5c089be95d3e&apikey=MYKEY

      // returns:
     // {"status":"1","message":"OK","result":[{"address":"0xe14a4fc7b96e8a3b701fd3d821bdce8f8c0aaef4","topics":["0x1cf3b03a6cf19fa2baba4df148e9dcabedea7f8a5c07840e207e5c089be95d3e","0x00000000000000000000000065d493115f6f7a5152a3da9ca6c26a1ea0e29b85"],"data":"0x","blockNumber":"0x1e128ea","timeStamp":"0x627ac6dc","gasPrice":"0x306dc4200","gasUsed":"0x5a10b","logIndex":"0x1","transactionHash":"0x0109b0fa98ded9c63e9d38d4aa30dcb0c68073bb3288f5cb920abaed14f74ec5","transactionIndex":"0x1"}]}

      /*
        Beacon proxy: BeaconUpgraded(address)
        Beacon: OwnershipTransferred(address,address)
        ProxyAdmin: OwnershipTransferred(address,address)
        TransparentUpgradeableProxy: AdminChanged(address,address)

      */


      // ----
      const tx = await getTransactionByHash(hre.network.provider, txHash);
      if (tx === null) {
        // TODO
        throw new Error("txhash not found " + txHash);
      }
      const txInput = tx.input;
      console.log("TX deploy code: " + txInput);
      
      constructorArguments= inferConstructorArgs(txInput, UpgradeableBeacon.bytecode);
      if (constructorArguments === undefined) {
        // TODO
        throw new Error("constructor args not found");
      }
      console.log("verifying beacon: " + addresses.beacon);
      await verifyProxy(etherscanApi, addresses.beacon, constructorArguments, UpgradeableBeacon);

    } else {
      let artifact: ContractArtifactJson = ERC1967Proxy;
      let constructorArguments = await getConstructorArgs(hre, await getFactory(hre, artifact), proxyAddress);
      console.log(`UUPS: got constructor args ${constructorArguments}`);
      if (constructorArguments === undefined) {
        artifact = TransparentUpgradeableProxy;
        constructorArguments = await getConstructorArgs(hre, await getFactory(hre, artifact), proxyAddress);
        console.log(`Transparent: got constructor args ${constructorArguments}`);
        if (constructorArguments === undefined) {
          console.log("The proxy contract bytecode differs than the version defined in the OpenZeppelin Upgrades Plugin. Verifying directly instead...");
          return await hardhatVerify(args.address);
        }
      }
      return await verifyProxy(etherscanApi, proxyAddress, constructorArguments, artifact);
    }
  }

  async function hardhatVerify(address: string) {
    return await runSuper({ ...args, address });
  }
}



export async function getEtherscanTxCreationHash(
  url: string,
  address: string,
  topic: string,
  apikey: string
): Promise<any> {
  const { request } = await import("undici");

  const params = {
    module: 'logs',
    action: 'getLogs',
    fromBlock: '0',
    toBlock: 'latest',
    address: address,
    topic0: '0x' + keccak256(Buffer.from(topic)).toString('hex'),
    apikey: apikey
  }

  const parameters = new URLSearchParams({ ...params });
  const method: Dispatcher.HttpMethod = "POST";
  const requestDetails = {
    method,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters.toString(),
  };

  let response: Dispatcher.ResponseData;
  try {
    response = await request(url, requestDetails);
    //console.log("ETHERSCAN LOGS RESPONSE " + JSON.stringify(response));
    //console.log("ETHERSCAN LOGS RESPONSE BODY " + await response.body.text());
    console.log("getting responsebody");
    const responseBody = await response.body.json();
    console.log("got responsebody");
    console.log("ETHERSCAN LOGS RESPONSE BODY AS JSON " + JSON.stringify(responseBody));
    const txHash = responseBody.result[0].transactionHash;
    if (txHash !== undefined) {
      console.log("Found tx hash! " + txHash);
      return txHash;
    } else {
      // TODO
      throw new Error("Failed to find tx hash for creation of address " + address);
    }

  } catch (error: any) {
    throw new UpgradesError(
      `Failed to get etherscan logs ${error}`
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


interface ContractArtifactJson { 
  contractName: string;
  sourceName: string;
  abi: any;
  bytecode: any;
}

async function getFactory(hre: HardhatRuntimeEnvironment, contractImport: ContractArtifactJson): Promise<ContractFactory> {
  return hre.ethers.getContractFactory(contractImport.abi, contractImport.bytecode, undefined);
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

async function getConstructorArgs(hre: HardhatRuntimeEnvironment, proxyFactory: ContractFactory, proxyAddress: any) {
  const txHash = await getTransactionHashFromManifest(hre.network.provider, proxyAddress);
  if (txHash === undefined) {
    // TODO get constructor args from user input
    throw new UpgradesError("Define constructor arguments");
  }
  console.log("Got tx hash: " + txHash);

  // Determine contract based on whether transaction deployment code starts with the contract's creation code 


  const creationCode = proxyFactory.bytecode;
  console.log("Creation code: " + creationCode);

  const tx = await getTransactionByHash(hre.network.provider, txHash);
  if (tx === null) {
    return undefined;
  }
  const txInput = tx.input;
  console.log("TX deploy code: " + txInput);
  
  return inferConstructorArgs(txInput, creationCode);
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