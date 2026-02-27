import { HardhatRuntimeEnvironment } from 'hardhat/types/hre';
import type { ContractFactory } from 'ethers';
import assert from 'assert';

import { DeployTransaction, DefenderDeploy } from './index.js';
import { waitForDeployment } from '../defender/utils.js';
import { Deployment, RemoteDeploymentId, DeployOpts } from '@openzeppelin/upgrades-core';
import { attach } from './ethers.js';
import { ContractTypeOfFactory } from '../type-extensions.js';

/**
 * Gets a contract instance from a deployment, where the deployment may be remote.
 *
 * The returned instance has an overridden `waitForDeployment` method that:
 * - For remote (Defender) deployments, waits for the remote deployment to complete and
 *   updates `deploymentTransaction` if the transaction hash changed.
 * - For all deployments, after the transaction is mined, polls `getCode` until the
 *   contract bytecode is visible to the RPC provider. This handles eventual consistency
 *   on load-balanced RPC endpoints where `getTransactionReceipt` may confirm before
 *   `getCode`/`getStorageAt` reflect the new state.
 *
 * @param hre The Hardhat Runtime Environment
 * @param contract The contract factory
 * @param opts The deploy and defender options
 * @param deployment The deployment
 * @returns The contract instance
 */
export function getContractInstance<F extends ContractFactory>(
  hre: HardhatRuntimeEnvironment,
  contract: F,
  opts: DeployOpts & DefenderDeploy,
  deployment: Deployment & DeployTransaction & RemoteDeploymentId,
): ContractTypeOfFactory<F> {
  const instance = attach(contract, deployment.address) as ContractTypeOfFactory<F>;

  // @ts-ignore Won't be readonly because instance was created through attach.
  instance.deploymentTransaction = () => deployment.deployTransaction ?? null; // Convert undefined to null to conform to ethers.js types.

  const origWait = instance.waitForDeployment.bind(instance);
  instance.waitForDeployment = async () => {
    // For Defender deployments, wait for the remote deployment to complete
    if (opts.useDefenderDeploy && deployment.remoteDeploymentId !== undefined) {
      assert(deployment.remoteDeploymentId !== undefined);
      const updatedTxHash = await waitForDeployment(
        hre,
        opts,
        await instance.getAddress(),
        deployment.remoteDeploymentId,
      );

      const { ethers } = await hre.network.connect();

      if (updatedTxHash !== undefined && updatedTxHash !== deployment.txHash) {
        const updatedTx = await ethers.provider.getTransaction(updatedTxHash);
        // @ts-ignore Won't be readonly because instance was created through attach.
        instance.deploymentTransaction = () => updatedTx;
      }
    }

    // Wait for the deployment transaction to be mined
    await origWait();

    // Poll until the contract bytecode is visible to the RPC provider.
    // This mirrors the hasCode polling in @openzeppelin/upgrades-core's
    // waitAndValidateDeployment, which already protects implementation deploys.
    const address = await instance.getAddress();
    const provider = instance.runner?.provider;
    if (provider) {
      const timeout = opts?.timeout ?? 60e3;
      const pollInterval = opts?.pollingInterval ?? 5e3;
      const startTime = Date.now();

      while (true) {
        const code = await provider.getCode(address);
        if (code !== '0x') break;

        if (timeout !== 0 && Date.now() - startTime >= timeout) {
          throw new Error(
            `Timed out waiting for contract bytecode at ${address}. ` +
              `The deployment transaction was mined but the RPC provider has not yet returned the bytecode.`,
          );
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    return instance;
  };

  return instance;
}
