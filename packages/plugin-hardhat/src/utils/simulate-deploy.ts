import {
  fetchOrDeploy, fetchOrDeployAdmin,
} from '@openzeppelin/upgrades-core';
import type { ContractFactory } from 'ethers';
import { FormatTypes } from 'ethers/lib/utils';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployData, getDeployData } from './deploy-impl';
import { Options } from './options';

export async function simulateDeployAdmin(hre: HardhatRuntimeEnvironment, ProxyAdminFactory: ContractFactory, opts: Options, adminAddress: string) {
  const { deployData, simulateDeploy } = await simulateDeployment(hre, ProxyAdminFactory, opts, adminAddress);
  const manifestAdminAddress = await fetchOrDeployAdmin(deployData.provider, simulateDeploy, opts);
  // TODO give warning if imported admin differs from manifest
  if (adminAddress !== manifestAdminAddress) {
    throw new Error("admin address does not match manifest admin address"); // TODO change this to a warning
  }
}

export async function simulateDeployImpl(hre: HardhatRuntimeEnvironment, ImplFactory: ContractFactory, opts: Options, implAddress: string) {
  const { deployData, simulateDeploy } = await simulateDeployment(hre, ImplFactory, opts, implAddress);
  await fetchOrDeploy(deployData.version, deployData.provider, simulateDeploy);
}

async function simulateDeployment(hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
  implAddress: string) {
  const deployData = await getDeployData(hre, ImplFactory, opts);
  const simulateDeploy = await getSimulateDeployFunction(deployData, ImplFactory, implAddress);
  return { deployData, simulateDeploy };
}

/**
 * Gets a function that returns a simulated deployment of the given contract to the given address.
 */
async function getSimulateDeployFunction(deployData: DeployData, contractFactory: ContractFactory, addr: string) {
  const simulateDeploy = async () => {
    const abi = contractFactory.interface.format(FormatTypes.minimal) as string[];
    const deployment = Object.assign({ abi });
    return { ...deployment, layout: deployData.layout, address: addr };
  };
  return simulateDeploy;
}