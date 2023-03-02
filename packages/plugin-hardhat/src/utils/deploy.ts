import type { Deployment } from '@openzeppelin/upgrades-core';
import debug from './debug';
import type { ethers, ContractFactory } from 'ethers';
import { getContractAddress } from 'ethers/lib/utils';

import { promises as fs } from 'fs';

// import fsExtra from "fs-extra";
import { PlatformClient } from 'platform-deploy-client';
import { DeploymentResponse } from 'platform-deploy-client/lib/models';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';
import ERC1967ProxyDBG from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.dbg.json';

import BeaconProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json';
import BeaconProxyDBG from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.dbg.json';

import UpgradeableBeacon from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import UpgradeableBeaconDBG from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.dbg.json';

import TransparentUpgradeableProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json';
import TransparentUpgradeableProxyDBG from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.dbg.json';

import ProxyAdmin from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json';
import ProxyAdminDBG from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.dbg.json';

export interface DeployTransaction {
  deployTransaction: ethers.providers.TransactionResponse;
}

const deployableProxyContracts = [ ERC1967Proxy, BeaconProxy, UpgradeableBeacon, TransparentUpgradeableProxy, ProxyAdmin ];

export async function deploy(
  hre: HardhatRuntimeEnvironment,
  factory: ContractFactory,
  ...args: unknown[]
): Promise<Required<Deployment & DeployTransaction>> {
  // const contractInstance = await factory.deploy(...args);




    // platform API key
    const client = PlatformClient({ apiKey: '', apiSecret: '' });

    // Start with ContractFactory
    // 1. Get ContractFactory's bytecode
    // 2. Look for Artifact file that has ContractFactory's bytecode. Get fully qualified sourceName from artifact
    // 3. Look for build-info file that has fully qualified sourceName in its solc input

    // We get the contract to deploy
    // console.log("factory " + JSON.stringify(factory, null, 2));

    const bytecode = factory.bytecode;
    // console.log("bytecode " + bytecode);

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
        console.log("got solc input ");// + JSON.stringify(buildInfo.input, null, 2));
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
          
          console.log("using buildInfo: " + buildInfo);

        }
      }
    }



    const asArgs = [...args] as (string | number | boolean)[];

    console.log("CONSTRUCTOR ARGS " + asArgs);

    console.log("BEFORE PLATFORM DEPLOY");

    const deploymentResponse = await client.Deployment.deploy({
      contractName: contractName,
      contractPath: sourceName,
      network: 'mumbai', // TODO
      artifactPayload: JSON.stringify(buildInfo),
      licenseType: 'MIT', // TODO
      constructorInputs: asArgs,
      verifySourceCode: true, // TODO
    });

    // console.log(`depl response ${JSON.stringify(deploymentResponse, null, 2)}`);

    const txResponse = await hre.ethers.provider.getTransaction(deploymentResponse.txHash);
    // console.log(`tx response ${JSON.stringify(txResponse, null, 2)}`);

// TODO look into problem: the create2 contract that created the proxy is the owner.


    // const contractInstance = factory.attach(deploymentResponse.address);

    // deploymentResponse.txHash;
    // contractInstance.deployTransaction


    // TODO

  // const { deployTransaction } = contractInstance;

  // const address: string = getContractAddress({
  //   from: await factory.signer.getAddress(),
  //   nonce: deployTransaction.nonce,
  // });
  // if (address !== contractInstance.address) {
  //   debug(
  //     `overriding contract address from ${contractInstance.address} to ${address} for nonce ${deployTransaction.nonce}`,
  //   );
  // }

  // const txHash = deployTransaction.hash;
  // return { address, txHash, deployTransaction };

  const checksumAddr = hre.ethers.utils.getAddress( deploymentResponse.address );
  console.log('checksum addr ' + checksumAddr);
  
  return { address: checksumAddr, txHash: deploymentResponse.txHash, deployTransaction: txResponse };
}

// import { promisify } from 'util';
// const sleep = promisify(setTimeout);

// async function getTransactionResponse(deploymentResponse: DeploymentResponse): Promise<ethers.providers.TransactionResponse> {
//   return {
//     hash: deploymentResponse.txHash,
//     confirmations: 0, // TODO get confirmations
//     from: '', // TODO get relayer address,
//     wait: (confirmations?: number) => { 
//       while (deploymentResponse.status === 'submitted') { 
//         sleep(1000);
//       }
//       if (deploymentResponse.status === 'completed') {
//         hre
//         const txReceipt: ethers.providers.TransactionReceipt = {
//           to: '',
//           from: '',
//           contractAddress: '',
//           transactionIndex: 0,
//           gasUsed: new ethers.BigNumber(0),
//           logsBloom: '',
//           blockHash: '',
//           transactionHash: deploymentResponse.txHash,
//           logs: new Array(),
//           blockNumber: 0,
//           confirmations: 0,
//           cumulativeGasUsed: 0,
//           effectiveGasPrice: 0,
//           byzantium: true,
//           type: 1,
//         };
//         return {
//           to: '',
//           from: '',
//           contractAddress: '',
//           transactionIndex: '',
//           gasUsed: 0,
//           logsBloom: '',
//           blockHash: '',
//           transactionHash: deploymentResponse.txHash,
//           logs: new Array(),
//           blockNumber: 0,
//           confirmations: 0,
//           cumulativeGasUsed: 0,
//           effectiveGasPrice: 0,
//           byzantium: true,
//           type: 1,
//         };
//       } else {
//         throw new Error(`Failed to deploy transaction with id ${deploymentResponse.transactionId} on Platform: " + deploymentResponse.status`);
//       }
//     },
//   }
  // hash: string;

  // // Only if a transaction has been mined
  // blockNumber?: number,
  // blockHash?: string,
  // timestamp?: number,

  // confirmations: number,

  // // Not optional (as it is in Transaction)
  // from: string;

  // // The raw transaction
  // raw?: string,

  // // This function waits until the transaction has been mined
  // wait: (confirmations?: number) => Promise<TransactionReceipt>
// };