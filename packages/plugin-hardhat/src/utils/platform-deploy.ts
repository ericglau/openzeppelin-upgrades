import { Deployment, getChainId, UpgradesError } from '@openzeppelin/upgrades-core';
import type { ethers, ContractFactory } from 'ethers';

import { promises as fs } from 'fs';

import { PlatformClient, SourceCodeLicense } from 'platform-deploy-client';
import { Network, fromChainId } from 'platform-deploy-client/node_modules/defender-base-client'; // TODO fix dependencies

import { BuildInfo, HardhatRuntimeEnvironment } from 'hardhat/types';


import artifactsBuildInfo from '@openzeppelin/upgrades-core/artifacts/build-info.json';


import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';
import BeaconProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json';
import UpgradeableBeacon from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import TransparentUpgradeableProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json';
import ProxyAdmin from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json';

export interface DeployTransaction {
  deployTransaction: ethers.providers.TransactionResponse;
}

const deployableProxyContracts = [ ERC1967Proxy, BeaconProxy, UpgradeableBeacon, TransparentUpgradeableProxy, ProxyAdmin ];

export async function platformDeploy(
  hre: HardhatRuntimeEnvironment,
  factory: ContractFactory,
  ...args: unknown[]
): Promise<Required<Deployment & DeployTransaction>> {


  // TODO get from Hardhat config
    // platform API key
    const client = PlatformClient({ apiKey: '', apiSecret: '' });



  let { contractName, sourceName, buildInfo } = await getContractInfo(factory, hre);
  
  const constructorArgs = [...args] as (string | number | boolean)[];

  console.log("constructor args " + JSON.stringify(constructorArgs, null, 2));
  console.log("BEFORE PLATFORM DEPLOY");
  console.log(contractName, sourceName);

  const network = await getNetwork(hre);
  console.log("USING NETWORK NAME " + network);
  
  const deploymentResponse = await client.Deployment.deploy({
    contractName: contractName,
    contractPath: sourceName,
    network: network,
    artifactPayload: JSON.stringify(buildInfo),
    licenseType: getLicense(buildInfo, sourceName, contractName),
    constructorInputs: constructorArgs,
    verifySourceCode: getVerifySourceCodeOption(),
  });

  const txResponse = await hre.ethers.provider.getTransaction(deploymentResponse.txHash);
  const checksumAddress = hre.ethers.utils.getAddress(deploymentResponse.address); 
  return { address: checksumAddress, txHash: deploymentResponse.txHash, deployTransaction: txResponse };
}

async function getNetwork(hre: HardhatRuntimeEnvironment) : Promise<Network> {
  const { provider } = hre.network;
  let chainId = hre.network.config.chainId ?? await getChainId(provider);
  console.log("GOT CHAIN ID " +  chainId);
  const network = fromChainId(chainId);
  if (network === undefined) {
    throw new UpgradesError(`Could not get network name from chain id ${chainId}.`,
      () => "Ensure you are using a network that is supported by Platform.");
  }
  return network;
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

function getVerifySourceCodeOption(): boolean {
  // TODO check passed option or check hardhat config for etherscan api key
  // TODO use const etherscanApi = await getEtherscanAPIConfig(hre);
  return true;
}

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


