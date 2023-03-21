import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Network, fromChainId } from 'defender-base-client';
import { getChainId } from '@openzeppelin/upgrades-core';

import { AdminClient } from 'defender-admin-client';
import { HardhatPlatformConfig } from '../type-extensions';

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
