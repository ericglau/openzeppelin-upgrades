import { Deployment, getChainId, UpgradesError } from '@openzeppelin/upgrades-core';
import type { ethers, ContractFactory } from 'ethers';

import { promises as fs } from 'fs';

import { BlockExplorerApiKeyClient, BlockExplorerApiKeyResponse, PlatformClient, SourceCodeLicense } from 'platform-deploy-client';
import { Network, fromChainId } from 'platform-deploy-client/node_modules/defender-base-client'; // TODO fix dependencies

import { BuildInfo, HardhatRuntimeEnvironment } from 'hardhat/types';

import debug from './debug';

import artifactsBuildInfo from '@openzeppelin/upgrades-core/artifacts/build-info.json';


import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';
import BeaconProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json';
import UpgradeableBeacon from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import TransparentUpgradeableProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json';
import ProxyAdmin from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json';
import { getEtherscanAPIConfig } from './etherscan-api';
import { Platform } from './options';

export interface DeployTransaction {
  deployTransaction: ethers.providers.TransactionResponse;
}

const deployableProxyContracts = [ ERC1967Proxy, BeaconProxy, UpgradeableBeacon, TransparentUpgradeableProxy, ProxyAdmin ];

function getPlatformClient(hre: HardhatRuntimeEnvironment) {
  const cfg = hre.config.platform;
  if (!cfg || !cfg.apiKey || !cfg.apiSecret) {
    const sampleConfig = JSON.stringify({ apiKey: 'YOUR_API_KEY', apiSecret: 'YOUR_API_SECRET' }, null, 2);
    throw new Error(
      `Missing Platform API key and secret in hardhat config. Add the following to your hardhat.config.js configuration:\nplatform: ${sampleConfig}\n`,
    );
  }
  return PlatformClient(cfg);
}

async function getNetwork(hre: HardhatRuntimeEnvironment) : Promise<Network> {
  const { provider } = hre.network;
  let chainId = hre.network.config.chainId ?? await getChainId(provider);
  console.log("GOT CHAIN ID " +  chainId);
  const network = fromChainId(chainId);
  if (network === undefined) {
    throw new Error(`Network ${chainId} is not supported by Platform`);
  }
  return network;
}

async function validateBlockExplorerApiKey(hre: HardhatRuntimeEnvironment, network: Network, client: BlockExplorerApiKeyClient) {
  const registeredKeys = await client.list();

  if (registeredKeys.length == 0 || !(await hasNetworkKey())) {
    const etherscanApiConfig = await getEtherscanAPIConfig(hre); // hardhat-etherscan throws an error here if the network is not configured
    debug("Found Etherscan API key in Hardhat configuration. Registering as block explorer API key on Platform...");
    try {
      await client.create({
        key: etherscanApiConfig.key,
        network: network,
      });
      debug(`Successfully registered block explorer API key for network ${network} on Platform.`);
    } catch(e: any) {
      console.error(`Could not register block explorer API key for network ${network} on Platform.`);
      throw e;
    }
  } else {
    debug(`Found block explorer API key for network ${network} on Platform.`);
  }

  async function hasNetworkKey() {
    for (const key of registeredKeys) {
      if (key.network === network) {
        return true;
      }
    }
    return false;
  }
}

export async function platformDeploy(
  hre: HardhatRuntimeEnvironment,
  factory: ContractFactory,
  verifySourceCode: boolean = true,
  ...args: unknown[]
): Promise<Required<Deployment & DeployTransaction>> {
  const client = getPlatformClient(hre);

  let { contractName, sourceName, buildInfo } = await getContractInfo(factory, hre);
  
  const constructorArgs = [...args] as (string | number | boolean)[];

  console.log("constructor args " + JSON.stringify(constructorArgs, null, 2));
  console.log("BEFORE PLATFORM DEPLOY");
  console.log(contractName, sourceName);

  const network = await getNetwork(hre);
  console.log("USING NETWORK NAME " + network);

  if (verifySourceCode) {
    await validateBlockExplorerApiKey(hre, network, client.BlockExplorerApiKey);
  }

  const payload = {
    contractName: contractName,
    contractPath: sourceName,
    network: network,
    // artifactPayload: JSON.stringify(buildInfo),
    licenseType: getLicense(buildInfo, sourceName, contractName),
    constructorInputs: constructorArgs,
    verifySourceCode: verifySourceCode,
  };

  console.log("PAYLOAD " + JSON.stringify(payload, null, 2));

  throw new Error("BREAK");

  const deploymentResponse = await client.Deployment.deploy({
    contractName: contractName,
    contractPath: sourceName,
    network: network,
    artifactPayload: JSON.stringify(buildInfo),
    licenseType: getLicense(buildInfo, sourceName, contractName),
    constructorInputs: constructorArgs,
    verifySourceCode: verifySourceCode,
  });

  const txResponse = await hre.ethers.provider.getTransaction(deploymentResponse.txHash);
  const checksumAddress = hre.ethers.utils.getAddress(deploymentResponse.address); 
  return { address: checksumAddress, txHash: deploymentResponse.txHash, deployTransaction: txResponse };
}



function getLicense(buildInfo: BuildInfo | undefined, sourceName: string, contractName: string): SourceCodeLicense | undefined {
  if (buildInfo !== undefined) {
    console.log("looking in buildinfo for license", sourceName, contractName);
    const content = buildInfo.output.contracts[sourceName][contractName];
    const metadataString = (content as any).metadata;
    const metadata = JSON.parse(metadataString);
    // console.log("metadata " + JSON.stringify(metadata.sources, null, 2));
    const license = metadata.sources[sourceName].license;
    console.log("found license " + license);
    return license;
  }
  console.log("error getting license");
  return undefined;
}

// async function getVerifySourceCodeOption(hre: HardhatRuntimeEnvironment): Promise<boolean> {
//   try {
//     await getEtherscanAPIConfig(hre);
//     debug('Etherscan API keys found. Enabling source code verification.');
//     return true;
//   } catch (e) {
//     debug('Etherscan API keys not found. Disabling source code verification.');
//     return false;
//   }
// }

async function getContractInfo(factory: ethers.ContractFactory, hre: HardhatRuntimeEnvironment) {
  // Start with ContractFactory
  // 1. Get ContractFactory's bytecode
  // 2. Look for Artifact file that has ContractFactory's bytecode. Get fully qualified sourceName from artifact
  // 3. Look for build-info file that has fully qualified sourceName in its solc input

  const bytecode = factory.bytecode;

  const allArtifacts = await hre.artifacts.getArtifactPaths();
  let fqcn = undefined;
  let sourceName, contractName;
  for (const artifactPath of allArtifacts) {
    // const artifact = await fsExtra.readJson(artifactPath);
    const artifact = await JSON.parse(await fs.readFile(artifactPath, 'utf8'));

    if (artifact.bytecode === bytecode) {
      // console.log('FOUND BYTECODE');
      sourceName = artifact.sourceName;
      contractName = artifact.contractName;
      fqcn = sourceName + ":" + contractName;
      console.log('FQCN ' + fqcn);
    }
  }


  let buildInfo;

  if (fqcn !== undefined) {
    buildInfo = await hre.artifacts.getBuildInfo(fqcn);
    if (buildInfo !== undefined) {
      console.log("got buildInfo for contract "); // + JSON.stringify(buildInfo.input, null, 2));
    } else {
      console.log("buildInfo / solc input undefined");
    }
  } else {
    // use precompiled proxy contracts
    for (const artifact of deployableProxyContracts) {
      if (artifact.bytecode === bytecode) {
        // console.log('FOUND BYTECODE');
        sourceName = artifact.sourceName;
        contractName = artifact.contractName;
        fqcn = sourceName + ":" + contractName;
        console.log('FQCN ' + fqcn);

        // TODO create a map of json to dbg
        buildInfo = artifactsBuildInfo;
        console.log("using proxy buildInfo"); // + JSON.stringify(buildInfo, null, 2));

      }
    }
  }
  return { contractName, sourceName, buildInfo };
}

class PlatformUnsupportedError extends UpgradesError {
  constructor(functionName: string, details?: string) {
    super(
      `The function ${functionName} is not supported with \`platform\``,
      () => details ?? `Call the function as upgrades.${functionName}(<your arguments>) without the \`platform\` option.`,
    );
  }
}

export function setPlatformDefaults(platformModule: boolean, opts: Platform) {
  if (platformModule && opts.platform === undefined) {
    opts.platform = true;
  }
}

export function assertNotPlatform(platformModule: boolean, opts: Platform | undefined, unsupportedFunction: string, details?: string) {
  if (platformModule || opts?.platform) {
    throw new PlatformUnsupportedError(unsupportedFunction, details);
  }
}