import { resolveEtherscanApiKey } from '@nomiclabs/hardhat-etherscan/dist/src/resolveEtherscanApiKey';
import { toCheckStatusRequest, toVerifyRequest } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanVerifyContractRequest';
import { delay, getVerificationStatus, verifyContract } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanService';
import { getProxyFactory } from './utils/factories';

import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';

import { Manifest, getImplementationAddressFromProxy, getTransactionByHash } from '@openzeppelin/upgrades-core';
import { EthereumProvider, HardhatRuntimeEnvironment, RunSuperFunction } from 'hardhat/types';

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
  const proxyAddress = args.address;

  const address = await getImplementationAddressFromProxy(hre.network.provider, proxyAddress);
  console.log(`Verifying implementation ${address} for proxy ${proxyAddress}`);

  runSuper({...args, address});
  console.log(`implementation ${address} verified!`);

  const etherscanAPIEndpoints = await hre.run("verify:get-etherscan-endpoint");
  console.log(`Etherscan endpoint urls: ${JSON.stringify(etherscanAPIEndpoints)}`);

  const config: any = hre.config; // TODO use an interface
  console.log(`Etherscan config: ${JSON.stringify(config.etherscan)}`);

  const etherscanAPIKey = resolveEtherscanApiKey(
    config.etherscan,
    etherscanAPIEndpoints.network
  );

  console.log("Build info: " + JSON.stringify(buildInfo, null, 2));
  

  const txHash = await getTransactionHashFromManifest(hre.network.provider, proxyAddress);
  if (txHash === undefined) {
    // TODO get constructor args from user input
    return;
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
    apiKey: etherscanAPIKey,
    contractAddress: proxyAddress,
    sourceCode: JSON.stringify(buildInfo.input),
    sourceName: ERC1967Proxy.sourceName, //'@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol', //contractInformation.sourceName,
    contractName: ERC1967Proxy.contractName, //'ERC1967Proxy', //contractInformation.contractName,
    compilerVersion:  `v${buildInfo.solcLongVersion}`, //solcFullVersion,
    constructorArguments: constructorArguments, //deployArgumentsEncoded,
  } //TODO encode proxy constructor with beacon or impl, and a separately encoded initializer call and arguments

  console.log("Params:\n"+JSON.stringify(params));

  const request = toVerifyRequest(params);
  //console.log("Verify request:\n"+JSON.stringify(request));

  const response = await verifyContract(etherscanAPIEndpoints.urls.apiURL, request);

  console.log("Response:\n"+JSON.stringify(response));

  const pollRequest = toCheckStatusRequest({
    apiKey: etherscanAPIKey,
    guid: response.message,
  });

  // Compilation is bound to take some time so there's no sense in requesting status immediately.
  await delay(700);
  const verificationStatus = await getVerificationStatus(
    etherscanAPIEndpoints.urls.apiURL,
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
