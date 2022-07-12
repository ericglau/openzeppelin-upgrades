import {
  assertNotProxy,
  fetchOrDeployGetDeployment,
  getImplementationAddress,
  getImplementationAddressFromBeacon,
  getStorageLayout,
  getUnlinkedBytecode,
  getVersion,
  processProxyKind,
  StorageLayout,
  ValidationDataCurrent,
  ValidationOptions,
  Version,
} from '@openzeppelin/upgrades-core';
import type { ContractFactory, ethers } from 'ethers';
import { FormatTypes } from 'ethers/lib/utils';
import type { EthereumProvider, HardhatRuntimeEnvironment } from 'hardhat/types';
import { deploy } from './deploy';
import { Options, DeployImplementationOptions, withDefaults } from './options';
import { BeaconValidator, ProxyValidator, validateUpgradeImpl, Validator } from './validate-impl';
import { readValidations } from './validations';

interface DeployedProxyImpl {
  impl: string;
  kind: NonNullable<ValidationOptions['kind']>;
  txResponse?: ethers.providers.TransactionResponse;
}

interface DeployedBeaconImpl {
  impl: string;
  txResponse?: ethers.providers.TransactionResponse;
}

export interface DeployData {
  provider: EthereumProvider;
  validations: ValidationDataCurrent;
  unlinkedBytecode: string;
  encodedArgs: string;
  version: Version;
  layout: StorageLayout;
  fullOpts: Required<Options>;
}

export async function getDeployData(
  hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
): Promise<DeployData> {
  const { provider } = hre.network;
  const validations = await readValidations(hre);
  const unlinkedBytecode = getUnlinkedBytecode(validations, ImplFactory.bytecode);
  const encodedArgs = ImplFactory.interface.encodeDeploy(opts.constructorArgs);
  const version = getVersion(unlinkedBytecode, ImplFactory.bytecode, encodedArgs);
  const layout = getStorageLayout(validations, version);
  const fullOpts = withDefaults(opts);
  return { provider, validations, unlinkedBytecode, encodedArgs, version, layout, fullOpts };
}

export async function processProxyImpl(deployData: DeployData, proxyAddress: string | undefined, opts: Options) {
  await processProxyKind(deployData.provider, proxyAddress, opts, deployData.validations, deployData.version);

  let currentImplAddress: string | undefined;
  if (proxyAddress !== undefined) {
    // upgrade scenario
    currentImplAddress = await getImplementationAddress(deployData.provider, proxyAddress);
  }
  return currentImplAddress;
}

export async function processBeaconImpl(beaconAddress: string | undefined, deployData: DeployData) {
  let currentImplAddress: string | undefined;
  if (beaconAddress !== undefined) {
    // upgrade scenario
    await assertNotProxy(deployData.provider, beaconAddress);
    currentImplAddress = await getImplementationAddressFromBeacon(deployData.provider, beaconAddress);
  }
  return currentImplAddress;
}

export async function deployStandaloneImpl(
  hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
): Promise<DeployedProxyImpl> {
  const deployData = await getDeployData(hre, ImplFactory, opts);
  return deployImpl(hre, deployData, ImplFactory, opts);
}

export async function deployProxyImpl(
  hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
  proxyAddress?: string,
): Promise<DeployedProxyImpl> {
  const deployer = new ProxyDeployer(proxyAddress);
  return await deployer.deploy(hre, ImplFactory, opts);
}

export async function deployBeaconImpl(
  hre: HardhatRuntimeEnvironment,
  ImplFactory: ContractFactory,
  opts: Options,
  beaconAddress?: string,
): Promise<DeployedBeaconImpl> {
  const deployer = new BeaconDeployer(beaconAddress);
  return await deployer.deploy(hre, ImplFactory, opts);
}

async function deployImpl(
  hre: HardhatRuntimeEnvironment,
  deployData: DeployData,
  ImplFactory: ContractFactory,
  opts: DeployImplementationOptions,
  currentImplAddress?: string,
): Promise<any> {
  await validateUpgradeImpl(deployData, opts, currentImplAddress);
  return await fetchOrDeployImpl(deployData, ImplFactory, opts, hre);
}

async function fetchOrDeployImpl(
  deployData: DeployData,
  ImplFactory: ContractFactory,
  opts: DeployImplementationOptions,
  hre: HardhatRuntimeEnvironment,
) {
  const layout = deployData.layout;

  const deployment = await fetchOrDeployGetDeployment(
    deployData.version,
    deployData.provider,
    async () => {
      const abi = ImplFactory.interface.format(FormatTypes.minimal) as string[];
      const deployment = Object.assign({ abi }, await deploy(ImplFactory, ...deployData.fullOpts.constructorArgs));
      return { ...deployment, layout };
    },
    opts,
  );

  let txResponse;
  if (opts.getTxResponse) {
    if ('deployTransaction' in deployment) {
      txResponse = deployment.deployTransaction;
    } else if (deployment.txHash !== undefined) {
      txResponse = hre.ethers.provider.getTransaction(deployment.txHash);
    }
  }

  return { impl: deployment.address, kind: opts.kind, txResponse };
}

export class ProxyDeployer extends ProxyValidator {
  async deploy(hre: HardhatRuntimeEnvironment,
    ImplFactory: ContractFactory,
    opts: Options): Promise<any> {
    super.validate(hre, ImplFactory, opts);
    const deployData = await Validator.getDeployData(hre, ImplFactory, opts);
    return await fetchOrDeployImpl(deployData, ImplFactory, opts, hre);
  }
}

export class BeaconDeployer extends BeaconValidator {
  async deploy(hre: HardhatRuntimeEnvironment,
    ImplFactory: ContractFactory,
    opts: Options): Promise<any> {
    super.validate(hre, ImplFactory, opts);
    const deployData = await Validator.getDeployData(hre, ImplFactory, opts);
    return await fetchOrDeployImpl(deployData, ImplFactory, opts, hre);
  }
}