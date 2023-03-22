import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getChainId, hasCode, InvalidDeployment, UpgradesError, DeploymentResponse } from '@openzeppelin/upgrades-core';

import { Network, fromChainId } from 'defender-base-client';
import { AdminClient } from 'defender-admin-client';
import { PlatformClient } from 'platform-deploy-client';

import { HardhatPlatformConfig } from '../type-extensions';
import { Platform } from '../utils';
import debug from '../utils/debug';

import { promisify } from 'util';
const sleep = promisify(setTimeout);

export function getPlatformApiKey(hre: HardhatRuntimeEnvironment): HardhatPlatformConfig {
  const cfg = hre.config.platform;
  if (!cfg || !cfg.apiKey || !cfg.apiSecret) {
    const sampleConfig = JSON.stringify({ apiKey: 'YOUR_API_KEY', apiSecret: 'YOUR_API_SECRET' }, null, 2);
    throw new Error(
      `Missing Platform API key and secret in hardhat config. Add the following to your hardhat.config.js configuration:\nplatform: ${sampleConfig}\n`,
    );
  }
  return cfg;
}

export function getAdminClient(hre: HardhatRuntimeEnvironment): AdminClient {
  return new AdminClient(getPlatformApiKey(hre));
}

export async function getNetwork(hre: HardhatRuntimeEnvironment): Promise<Network> {
  const { provider } = hre.network;
  const chainId = hre.network.config.chainId ?? (await getChainId(provider));
  const network = fromChainId(chainId);
  if (network === undefined) {
    throw new Error(`Network ${chainId} is not supported by Platform`);
  }
  return network;
}

class PlatformUnsupportedError extends UpgradesError {
  constructor(functionName: string, details?: string) {
    super(
      `The function ${functionName} is not supported with \`platform\``,
      () => details ?? `Call the upgrades.${functionName} function without the \`platform\` option.`,
    );
  }
}

export function setPlatformDefaults(platformModule: boolean, opts: Platform) {
  if (platformModule && opts.platform === undefined) {
    opts.platform = true;
  }
}

export function assertNotPlatform(
  platformModule: boolean,
  opts: Platform | undefined,
  unsupportedFunction: string,
  details?: string,
) {
  if (platformModule || opts?.platform) {
    throw new PlatformUnsupportedError(unsupportedFunction, details);
  }
}

function getPlatformClient(hre: HardhatRuntimeEnvironment) {
  return PlatformClient(getPlatformApiKey(hre));
}

export async function getDeploymentResponse(
  hre: HardhatRuntimeEnvironment,
  deploymentId: string,
): Promise<DeploymentResponse> {
  const client = getPlatformClient(hre);
  return await client.Deployment.get(deploymentId);
}

export async function waitForDeployment(hre: HardhatRuntimeEnvironment, address: string, deploymentId: string) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await hasCode(hre.ethers.provider, address)) {
      debug('code in target address found', address);
      break;
    }

    debug('verifying deployment id', deploymentId);
    const response = await getDeploymentResponse(hre, deploymentId);
    const status = response.status;
    if (status === 'completed') {
      debug('succeeded verifying deployment id mined', deploymentId);
      break;
    } else if (status === 'failed') {
      debug('deployment id was reverted', deploymentId);
      throw new InvalidDeployment({ address, txHash: response.txHash, deploymentId });
    } else if (status === 'submitted') {
      debug('waiting for deployment id mined', deploymentId);
      await sleep(5000); // TODO use an option for polling
    } else {
      throw new Error(`Broken invariant: Unrecognized status ${status} for deployment id ${deploymentId}`);
    }
  }
}