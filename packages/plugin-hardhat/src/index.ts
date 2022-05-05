/* eslint-disable @typescript-eslint/no-var-requires */

import '@nomiclabs/hardhat-ethers';
import './type-extensions';
import { subtask, extendEnvironment, extendConfig, task } from 'hardhat/config';
import { TASK_COMPILE_SOLIDITY, TASK_COMPILE_SOLIDITY_COMPILE } from 'hardhat/builtin-tasks/task-names';
import { lazyObject } from 'hardhat/plugins';
import { HardhatConfig } from 'hardhat/types';
import { getImplementationAddressFromBeacon, getImplementationAddressFromProxy, silenceWarnings, SolcInput } from '@openzeppelin/upgrades-core';
import type { DeployFunction } from './deploy-proxy';
import type { PrepareUpgradeFunction } from './prepare-upgrade';
import type { UpgradeFunction } from './upgrade-proxy';
import type { DeployBeaconFunction } from './deploy-beacon';
import type { DeployBeaconProxyFunction } from './deploy-beacon-proxy';
import type { UpgradeBeaconFunction } from './upgrade-beacon';
import type { ForceImportFunction } from './force-import';
import type { ChangeAdminFunction, TransferProxyAdminOwnershipFunction, GetInstanceFunction } from './admin';

import { resolveEtherscanApiKey } from '@nomiclabs/hardhat-etherscan/dist/src/resolveEtherscanApiKey';
import { toCheckStatusRequest, toVerifyRequest } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanVerifyContractRequest';
import { delay, getVerificationStatus, verifyContract } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanService';
import { getProxyFactory } from './utils/factories';

import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';

export interface HardhatUpgrades {
  deployProxy: DeployFunction;
  upgradeProxy: UpgradeFunction;
  prepareUpgrade: PrepareUpgradeFunction;
  deployBeacon: DeployBeaconFunction;
  deployBeaconProxy: DeployBeaconProxyFunction;
  upgradeBeacon: UpgradeBeaconFunction;
  forceImport: ForceImportFunction;
  silenceWarnings: typeof silenceWarnings;
  admin: {
    getInstance: GetInstanceFunction;
    changeProxyAdmin: ChangeAdminFunction;
    transferProxyAdminOwnership: TransferProxyAdminOwnershipFunction;
  };
  erc1967: {
    getAdminAddress: (proxyAdress: string) => Promise<string>;
    getImplementationAddress: (proxyAdress: string) => Promise<string>;
    getBeaconAddress: (proxyAdress: string) => Promise<string>;
  };
  beacon: {
    getImplementationAddress: (beaconAddress: string) => Promise<string>;
  };
}

interface RunCompilerArgs {
  input: SolcInput;
}

subtask(TASK_COMPILE_SOLIDITY, async (args: { force: boolean }, hre, runSuper) => {
  const { readValidations, ValidationsCacheOutdated, ValidationsCacheNotFound } = await import('./utils/validations');

  try {
    await readValidations(hre);
  } catch (e) {
    if (e instanceof ValidationsCacheOutdated || e instanceof ValidationsCacheNotFound) {
      args = { ...args, force: true };
    } else {
      throw e;
    }
  }

  return runSuper(args);
});

subtask(TASK_COMPILE_SOLIDITY_COMPILE, async (args: RunCompilerArgs, hre, runSuper) => {
  const { validate, solcInputOutputDecoder } = await import('@openzeppelin/upgrades-core');
  const { writeValidations } = await import('./utils/validations');

  // TODO: patch input
  const { output, solcBuild } = await runSuper();

  const { isFullSolcOutput } = await import('./utils/is-full-solc-output');
  if (isFullSolcOutput(output)) {
    const decodeSrc = solcInputOutputDecoder(args.input, output);
    const validations = validate(output, decodeSrc);
    await writeValidations(hre, validations);
  }

  return { output, solcBuild };
});

extendEnvironment(hre => {
  hre.upgrades = lazyObject((): HardhatUpgrades => {
    const {
      silenceWarnings,
      getAdminAddress,
      getImplementationAddress,
      getBeaconAddress,
    } = require('@openzeppelin/upgrades-core');
    const { makeDeployProxy } = require('./deploy-proxy');
    const { makeUpgradeProxy } = require('./upgrade-proxy');
    const { makePrepareUpgrade } = require('./prepare-upgrade');
    const { makeDeployBeacon } = require('./deploy-beacon');
    const { makeDeployBeaconProxy } = require('./deploy-beacon-proxy');
    const { makeUpgradeBeacon } = require('./upgrade-beacon');
    const { makeForceImport } = require('./force-import');
    const { makeChangeProxyAdmin, makeTransferProxyAdminOwnership, makeGetInstanceFunction } = require('./admin');

    return {
      silenceWarnings,
      deployProxy: makeDeployProxy(hre),
      upgradeProxy: makeUpgradeProxy(hre),
      prepareUpgrade: makePrepareUpgrade(hre),
      deployBeacon: makeDeployBeacon(hre),
      deployBeaconProxy: makeDeployBeaconProxy(hre),
      upgradeBeacon: makeUpgradeBeacon(hre),
      forceImport: makeForceImport(hre),
      admin: {
        getInstance: makeGetInstanceFunction(hre),
        changeProxyAdmin: makeChangeProxyAdmin(hre),
        transferProxyAdminOwnership: makeTransferProxyAdminOwnership(hre),
      },
      erc1967: {
        getAdminAddress: proxyAddress => getAdminAddress(hre.network.provider, proxyAddress),
        getImplementationAddress: proxyAddress => getImplementationAddress(hre.network.provider, proxyAddress),
        getBeaconAddress: proxyAddress => getBeaconAddress(hre.network.provider, proxyAddress),
      },
      beacon: {
        getImplementationAddress: beaconAddress =>
          getImplementationAddressFromBeacon(hre.network.provider, beaconAddress),
      },
    };
  });
});

extendConfig((config: HardhatConfig) => {
  for (const compiler of config.solidity.compilers) {
    compiler.settings ??= {};
    compiler.settings.outputSelection ??= {};
    compiler.settings.outputSelection['*'] ??= {};
    compiler.settings.outputSelection['*']['*'] ??= [];

    if (!compiler.settings.outputSelection['*']['*'].includes('storageLayout')) {
      compiler.settings.outputSelection['*']['*'].push('storageLayout');
    }
  }
});

// Separate task:
// task("verify-proxy")
//   .addPositionalParam("address", "Address of the proxy to verify")
//   .setAction(async (args, hre) => {
//     const address = await getImplementationAddressFromProxy(hre.network.provider, args.address);
//     console.log(`Verifying implementation ${address} for proxy ${args.address}`);
//     await hre.run("verify", { "address": address });
//   });

const solcInput = require('@openzeppelin/upgrades-core/artifacts/solc-input.json');


// Override task:
task("verify")
  .setAction(async (args, hre, runSuper) => {
    const proxyAddress = args.address;

    const address = await getImplementationAddressFromProxy(hre.network.provider, proxyAddress);
    console.log(`Verifying implementation ${address} for proxy ${proxyAddress}`);

    // runSuper({...args, address});
    // console.log(`implementation ${address} verified!`);

    const etherscanAPIEndpoints = await hre.run("verify:get-etherscan-endpoint");
    console.log(`Etherscan endpoint urls: ${JSON.stringify(etherscanAPIEndpoints)}`);

    const config: any = hre.config; // TODO use an interface
    console.log(`Etherscan config: ${JSON.stringify(config.etherscan)}`);

    const etherscanAPIKey = resolveEtherscanApiKey(
      config.etherscan,
      etherscanAPIEndpoints.network
    );

    console.log("SOLC input: " + JSON.stringify(solcInput, null, 2));
    

    // const uupsProxyFactory = await getProxyFactory(hre);
    // console.log("Proxy: " + JSON.stringify(uupsProxyFactory));

    const params = {
      apiKey: etherscanAPIKey,
      contractAddress: proxyAddress,
      sourceCode: JSON.stringify(solcInput),
      sourceName: ERC1967Proxy.sourceName, //'@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol', //contractInformation.sourceName,
      contractName: ERC1967Proxy.contractName, //'ERC1967Proxy', //contractInformation.contractName,
      compilerVersion:  "v0.8.2+commit.661d1103", //solcFullVersion,
      constructorArguments: '0000000000000000000000006c32e2bb42ac4c402a3bb65c8f14bb71c89613de00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000064f62d18880000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000b48656c6c6f20576f726c6400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' //deployArgumentsEncoded,
    } //TODO encode proxy constructor with beacon or impl, and a separately encoded initializer call and arguments

    //console.log("Params:\n"+JSON.stringify(params));

    const request = toVerifyRequest(params);
    //console.log("Verify request:\n"+JSON.stringify(request));

    const response = await verifyContract(etherscanAPIEndpoints.urls.apiURL, request);

    console.log("Response:\n"+JSON.stringify(response));

    const pollRequest = toCheckStatusRequest({
      apiKey: etherscanAPIKey,
      guid: response.message,
    });
  
    // Compilation is bound to take some time so there's no sense in requesting status immediately.
    await delay(700);
    const verificationStatus = await getVerificationStatus(
      etherscanAPIEndpoints.urls.apiURL,
      pollRequest
    );
  
    console.log("Verification STATUS : \n"+JSON.stringify(verificationStatus));

    if (
      verificationStatus.isVerificationFailure() ||
      verificationStatus.isVerificationSuccess()
    ) {
      console.log(verificationStatus.message);
    }

  });