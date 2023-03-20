import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Network, fromChainId } from 'defender-base-client';
import { getChainId } from "@openzeppelin/upgrades-core";

export async function getNetwork(hre: HardhatRuntimeEnvironment) : Promise<Network> {
  const { provider } = hre.network;
  let chainId = hre.network.config.chainId ?? await getChainId(provider);
  const network = fromChainId(chainId);
  if (network === undefined) {
    throw new Error(`Network ${chainId} is not supported by Platform`);
  }
  return network;
}
