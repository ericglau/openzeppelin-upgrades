import { promisify } from 'util';

import debug from './utils/debug';
import { makeNonEnumerable } from './utils/make-non-enumerable';
import {
  EthereumProvider,
  getCode,
  getTransactionByHash,
  getTransactionReceipt,
  hasCode,
  isDevelopmentNetwork,
  isEmpty,
  isReceiptSuccessful,
} from './provider';
import { UpgradesError } from './error';
import { GenericDeployment } from './manifest';
import { hashBytecode } from './version';
import { deleteDeployment } from './impl-store';

const sleep = promisify(setTimeout);

export interface Deployment {
  address: string;
  txHash?: string;
}

export interface DeployOpts {
  /**
   * Timeout in milliseconds to wait for the transaction confirmation when deploying an implementation contract or proxy admin contract. Use `0` to wait indefinitely.
   */
  timeout?: number;

  /**
   * Polling interval in milliseconds between checks for the transaction confirmation when deploying an implementation contract or proxy admin contract.
   */
  pollingInterval?: number;
}

export async function resumeOrDeploy<T extends Deployment>(
  provider: EthereumProvider,
  cached: T | undefined,
  deploy: () => Promise<T>,
  deployment?: any, // TODO what happens if this is undefined? and how to properly type this
  merge?: boolean,
): Promise<T> {
  let shouldDeploy = true;
  if (cached !== undefined) {
    try {
      shouldDeploy = await validateStoredDeployment(cached, provider, merge);
    } catch (e) {
      if (e instanceof InvalidDeployment && (await isDevelopmentNetwork(provider))) {
        debug('ignoring invalid deployment in development network', e.deployment.address, e.reason);
        deleteDeployment(deployment);
      } else {
        throw e;
      }
    }
  }

  if (shouldDeploy || cached === undefined) {
    const deployment = await deploy();
    debug('initiated deployment', deployment.txHash, merge);
    return deployment; 
  } else {
    return cached;
  }
}

/**
 * Validate an existing deployment and determine whether a new deployment should occur
 * 
 * @param stored 
 * @param provider 
 * @param merge 
 * @return whether a new deployment should occur
 */
async function validateStoredDeployment<T extends GenericDeployment>(stored: T, provider: EthereumProvider, merge?: boolean) : Promise<boolean> {
  const { txHash } = stored;
  if (txHash !== undefined) {
    // If there is a deployment with txHash stored, we look its transaction up. If the
    // transaction is found, the deployment is reused.
    debug('validateStoredDeployment - found previous deployment', txHash);
    const tx = await getTransactionByHash(provider, txHash);
    if (tx !== null) {
      debug('validateStoredDeployment - resuming previous deployment', txHash);
      if (merge) {
        // If merging, wait for the existing deployment to be mined, then import the new one.
        waitAndValidateDeployment(provider, stored);
        return true;
      } else {
        // If not merging, reuse the existing deployment.
        return false;
      }
    } else {
      // If the transaction is not found we throw an error, except if we're in
      // a development network then we simply silently redeploy.
      // This error should be caught by the caller to determine if we're in a dev network.
      throw new InvalidDeployment(stored);
    }
  }
  const existingBytecode = await getCode(provider, stored.address);
  if (isEmpty(existingBytecode)) {
    throw new InvalidDeployment(stored, Reason.NoBytecode);
  } else if (stored.bytecodeHash !== undefined && stored.bytecodeHash !== hashBytecode(existingBytecode)) {
    throw new InvalidDeployment(stored, Reason.MismatchedBytecode);
  } else {
    // Bytecode exists and does not conflict.
    // If we are merging, this is what we expect, so we can go ahead and merge.
    // Otherwise, no need to redeploy
    return (merge === true);
  }
}

export async function waitAndValidateDeployment(
  provider: EthereumProvider,
  deployment: Deployment,
  type?: string,
  opts?: DeployOpts,
): Promise<void> {
  const { txHash, address } = deployment;

  // Poll for 60 seconds with a 5 second poll interval by default.
  const pollTimeout = opts?.timeout ?? 60e3;
  const pollInterval = opts?.pollingInterval ?? 5e3;

  debug('polling timeout', pollTimeout, 'polling interval', pollInterval);

  if (txHash !== undefined) {
    const startTime = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      debug('verifying deployment tx mined', txHash);
      const receipt = await getTransactionReceipt(provider, txHash);
      if (receipt && isReceiptSuccessful(receipt)) {
        debug('succeeded verifying deployment tx mined', txHash);
        break;
      } else if (receipt) {
        debug('tx was reverted', txHash);
        throw new InvalidDeployment(deployment);
      } else {
        debug('waiting for deployment tx mined', txHash);
        await sleep(pollInterval);
      }
      if (pollTimeout != 0) {
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime >= pollTimeout) {
          // A timeout is NOT an InvalidDeployment
          throw new TransactionMinedTimeout(deployment, type, !!opts);
        }
      }
    }
  }

  debug('verifying code in target address', address);
  const startTime = Date.now();
  while (!(await hasCode(provider, address))) {
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime >= pollTimeout || txHash === undefined) {
      throw new InvalidDeployment(deployment);
    }
    await sleep(pollInterval);
  }
  debug('code in target address found', address);
}

export class TransactionMinedTimeout extends UpgradesError {
  constructor(readonly deployment: Deployment, type?: string, configurableTimeout?: boolean) {
    super(
      `Timed out waiting for ${type ? type + ' ' : ''}contract deployment to address ${
        deployment.address
      } with transaction ${deployment.txHash}`,
      () =>
        'Run the function again to continue waiting for the transaction confirmation.' +
        (configurableTimeout
          ? ' If the problem persists, adjust the polling parameters with the timeout and pollingInterval options.'
          : ''),
    );
  }
}

export class InvalidDeployment extends Error {
  removed = false;
  reason: Reason | undefined;

  constructor(readonly deployment: Deployment, reason?: Reason) {
    super();
    this.reason = reason;
    // This hides the properties from the error when it's printed.
    makeNonEnumerable(this, 'removed');
    makeNonEnumerable(this, 'reason');
    makeNonEnumerable(this, 'deployment');
  }

  get message(): string {
    let msg =
      this.reason === Reason.MismatchedBytecode
        ? `Incorrect contract at address ${this.deployment.address}`
        : `No contract at address ${this.deployment.address}`;
    if (this.removed) {
      msg += ' (Removed from manifest)';
    }
    switch (this.reason) {
      case Reason.NoBytecode: {
        msg +=
          '\n\nNo bytecode was found at the address. Ensure that you are using the network files for the correct network.';
        break;
      }
      case Reason.MismatchedBytecode: {
        msg +=
          '\n\nDifferent bytecode was found at the address compared to a previous deployment. Ensure that you are using the network files for the correct network.';
        break;
      }
    }
    return msg;
  }
}

export enum Reason {
  NoBytecode = 'NoBytecode',
  MismatchedBytecode = 'MismatchedBytecode',
}
