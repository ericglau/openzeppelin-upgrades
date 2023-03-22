import { Deployment } from '@openzeppelin/upgrades-core';
import type { ethers, ContractFactory } from 'ethers';

import { promises as fs } from 'fs';

import { BlockExplorerApiKeyClient, PlatformClient, SourceCodeLicense } from 'platform-deploy-client';
import { Network } from 'defender-base-client';

import { BuildInfo, CompilerOutputContract, HardhatRuntimeEnvironment } from 'hardhat/types';

import debug from '../utils/debug';

import artifactsBuildInfo from '@openzeppelin/upgrades-core/artifacts/build-info.json';

import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';
import BeaconProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json';
import UpgradeableBeacon from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import TransparentUpgradeableProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json';
import ProxyAdmin from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json';
import { getEtherscanAPIConfig } from '../utils/etherscan-api';

import { getNetwork, getPlatformApiKey } from './utils';
import { DeployTransaction } from '../utils';

const deployableProxyContracts = [
  ERC1967Proxy,
  BeaconProxy,
  UpgradeableBeacon,
  TransparentUpgradeableProxy,
  ProxyAdmin,
];

interface ContractInfo {
  contractPath: string;
  contractName: string;
  buildInfo: BuildInfo;
}

type CompilerOutputWithMetadata = CompilerOutputContract & {
  metadata?: string;
};

function getPlatformClient(hre: HardhatRuntimeEnvironment) {
  return PlatformClient(getPlatformApiKey(hre));
}

export async function platformDeploy(
  hre: HardhatRuntimeEnvironment,
  factory: ContractFactory,
  verifySourceCode = true,
  ...args: unknown[]
): Promise<Required<Deployment & DeployTransaction>> {
  const client = getPlatformClient(hre);
  const contractInfo = await getContractInfo(factory, hre);
  const constructorArgs = [...args] as (string | number | boolean)[];
  const network = await getNetwork(hre);
  debug(`Network ${network}`);

  if (verifySourceCode) {
    await validateBlockExplorerApiKey(hre, network, client.BlockExplorerApiKey);
  }

  const deploymentResponse = await client.Deployment.deploy({
    contractName: contractInfo.contractName,
    contractPath: contractInfo.contractPath,
    network: network,
    artifactPayload: JSON.stringify(contractInfo.buildInfo),
    licenseType: getLicense(contractInfo),
    constructorInputs: constructorArgs,
    verifySourceCode: verifySourceCode,
  });

  const txResponse = await hre.ethers.provider.getTransaction(deploymentResponse.txHash);
  const checksumAddress = hre.ethers.utils.getAddress(deploymentResponse.address);
  return {
    address: checksumAddress,
    txHash: deploymentResponse.txHash,
    deployTransaction: txResponse,
    deploymentId: deploymentResponse.deploymentId,
  };
}

async function validateBlockExplorerApiKey(
  hre: HardhatRuntimeEnvironment,
  network: Network,
  client: BlockExplorerApiKeyClient,
) {
  const registeredKeys = await client.list();

  if (registeredKeys.length == 0 || !(await hasNetworkKey())) {
    const etherscanApiConfig = await getEtherscanAPIConfig(hre); // hardhat-etherscan throws an error here if the network is not configured
    debug('Found Etherscan API key in Hardhat configuration. Registering as block explorer API key on Platform...');
    try {
      await client.create({
        key: etherscanApiConfig.key,
        network: network,
      });
      debug(`Successfully registered block explorer API key for network ${network} on Platform.`);
    } catch (e: any) {
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

async function getContractInfo(factory: ethers.ContractFactory, hre: HardhatRuntimeEnvironment): Promise<ContractInfo> {
  // 1. Get ContractFactory's bytecode
  const bytecode = factory.bytecode;

  // 2. Look for Hardhat artifact file that has the same bytecode, then get fully qualified contract name.
  const allArtifacts = await hre.artifacts.getArtifactPaths();
  for (const artifactPath of allArtifacts) {
    const artifact = await JSON.parse(await fs.readFile(artifactPath, 'utf8'));
    if (artifact.bytecode === bytecode) {
      const contractPath = artifact.sourceName;
      const contractName = artifact.contractName;
      const fullyQualifiedContract = contractPath + ':' + contractName;
      debug(`Contract ${fullyQualifiedContract}`);

      // 3. Look for build-info file that has fully qualified contract name in its solc input
      const buildInfo = await hre.artifacts.getBuildInfo(fullyQualifiedContract);
      if (buildInfo === undefined) {
        throw new Error(
          `Could not get Hardhat compilation artifact for contract ${fullyQualifiedContract}. Run \`npx hardhat compile\``,
        );
      }
      return { contractPath, contractName, buildInfo };
    }
  }

  // Proxy contracts would not be found in the Hardhat compilation artifacts, so get these from the plugin's precompiled artifacts.
  for (const artifact of deployableProxyContracts) {
    if (artifact.bytecode === bytecode) {
      const contractPath = artifact.sourceName;
      const contractName = artifact.contractName;
      const buildInfo = artifactsBuildInfo;
      debug(`Proxy contract ${contractPath}:${contractName}`);
      return { contractPath, contractName, buildInfo };
    }
  }

  throw new Error('Could not find Hardhat compilation artifact corresponding to the given ethers contract factory'); // TODO figure out user action
}

function getLicense(contractInfo: ContractInfo): SourceCodeLicense | undefined {
  const compilerOutput: CompilerOutputWithMetadata =
    contractInfo.buildInfo.output.contracts[contractInfo.contractPath][contractInfo.contractName];

  const metadataString = compilerOutput.metadata;
  if (metadataString === undefined) {
    debug('Metadata not found in compiler output');
    return undefined;
  }

  const metadata = JSON.parse(metadataString);

  const license = metadata.sources[contractInfo.contractPath].license;
  if (license === undefined) {
    debug('License not found in metadata');
    return undefined;
  }

  debug(`Found license from metadata: ${license}`);
  return license;
}