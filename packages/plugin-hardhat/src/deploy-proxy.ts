import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ContractFactory, Contract } from 'ethers';
import fsExtra from "fs-extra";

import { Manifest, logWarning, ProxyDeployment, BeaconProxyUnsupportedError } from '@openzeppelin/upgrades-core';

import {
  DeployProxyOptions,
  deploy,
  getProxyFactory,
  getTransparentUpgradeableProxyFactory,
  DeployTransaction,
  deployProxyImpl,
  getInitializerData,
} from './utils';

export interface DeployFunction {
  (ImplFactory: ContractFactory, args?: unknown[], opts?: DeployProxyOptions): Promise<Contract>;
  (ImplFactory: ContractFactory, opts?: DeployProxyOptions): Promise<Contract>;
}

export function makeDeployProxy(hre: HardhatRuntimeEnvironment): DeployFunction {
  return async function deployProxy(
    ImplFactory: ContractFactory,
    args: unknown[] | DeployProxyOptions = [],
    opts: DeployProxyOptions = {},
  ) {
    if (!Array.isArray(args)) {
      opts = args;
      args = [];
    }

    const { provider } = hre.network;
    const manifest = await Manifest.forNetwork(provider);

    const { impl, kind } = await deployProxyImpl(hre, ImplFactory, opts);




    // Start with ContractFactory
    // 1. Get ContractFactory's bytecode
    // 2. Look for Artifact file that has ContractFactory's bytecode. Get fully qualified sourceName from artifact
    // 3. Look for build-info file that has fully qualified sourceName in its solc input


    // We get the contract to deploy
    // console.log("factory " + JSON.stringify(ImplFactory, null, 2));

    const bytecode = ImplFactory.bytecode;
    // console.log("bytecode " + bytecode);

    const allArtifacts = await hre.artifacts.getArtifactPaths();
    let fqcn = undefined;
    for (const artifactPath of allArtifacts) {
      const artifact = await fsExtra.readJson(artifactPath);

      if (artifact.bytecode === bytecode) {
        // console.log('FOUND BYTECODE');
        fqcn = artifact.sourceName + ":" + artifact.contractName;
        console.log('FQCN ' + fqcn);
      }
    }

    if (fqcn !== undefined) {
      const buildInfo = await hre.artifacts.getBuildInfo(fqcn);
      if (buildInfo !== undefined) {
        console.log("got solc input ");// + JSON.stringify(buildInfo.input, null, 2));
      } else {
        console.log("buildInfo / solc input undefined");
      }
    }






    const contractInterface = ImplFactory.interface;
    const data = getInitializerData(contractInterface, args, opts.initializer);

    if (kind === 'uups') {
      if (await manifest.getAdmin()) {
        logWarning(`A proxy admin was previously deployed on this network`, [
          `This is not natively used with the current kind of proxy ('uups').`,
          `Changes to the admin will have no effect on this new proxy.`,
        ]);
      }
    }

    let proxyDeployment: Required<ProxyDeployment & DeployTransaction>;
    switch (kind) {
      case 'beacon': {
        throw new BeaconProxyUnsupportedError();
      }

      case 'uups': {
        const ProxyFactory = await getProxyFactory(hre, ImplFactory.signer);
        proxyDeployment = Object.assign({ kind }, await deploy(ProxyFactory, impl, data));
        break;
      }

      case 'transparent': {
        const adminAddress = await hre.upgrades.deployProxyAdmin(ImplFactory.signer, opts);
        const TransparentUpgradeableProxyFactory = await getTransparentUpgradeableProxyFactory(hre, ImplFactory.signer);
        proxyDeployment = Object.assign(
          { kind },
          await deploy(TransparentUpgradeableProxyFactory, impl, adminAddress, data),
        );
        break;
      }
    }

    await manifest.addProxy(proxyDeployment);

    const inst = ImplFactory.attach(proxyDeployment.address);
    // @ts-ignore Won't be readonly because inst was created through attach.
    inst.deployTransaction = proxyDeployment.deployTransaction;
    return inst;
  };
}
