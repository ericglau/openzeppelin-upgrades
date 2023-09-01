/* eslint-disable @typescript-eslint/no-var-requires */

import '@nomicfoundation/hardhat-ethers';
import './type-extensions';
import { subtask, extendEnvironment, extendConfig } from 'hardhat/config';
import { TASK_COMPILE_SOLIDITY, TASK_COMPILE_SOLIDITY_COMPILE } from 'hardhat/builtin-tasks/task-names';
import { lazyObject } from 'hardhat/plugins';
import { HardhatConfig, HardhatRuntimeEnvironment } from 'hardhat/types';
import { getImplementationAddressFromBeacon, silenceWarnings, SolcInput } from '@openzeppelin/upgrades-core';
import type { DeployFunction } from './deploy-proxy';
import type { PrepareUpgradeFunction } from './prepare-upgrade';
import type { UpgradeFunction } from './upgrade-proxy';
import type { DeployBeaconFunction } from './deploy-beacon';
import type { DeployBeaconProxyFunction } from './deploy-beacon-proxy';
import type { UpgradeBeaconFunction } from './upgrade-beacon';
import type { ForceImportFunction } from './force-import';
import type { ChangeAdminFunction, TransferProxyAdminOwnershipFunction, GetInstanceFunction } from './admin';
import type { ValidateImplementationFunction } from './validate-implementation';
import type { ValidateUpgradeFunction } from './validate-upgrade';
import type { DeployImplementationFunction } from './deploy-implementation';
import { DeployAdminFunction, makeDeployProxyAdmin } from './deploy-proxy-admin';
import type { DeployContractFunction } from './deploy-contract';
import type { ProposeUpgradeFunction } from './platform/propose-upgrade';
import type { GetDefaultApprovalProcessFunction } from './platform/get-default-approval-process';

export interface HardhatUpgrades {
  deployProxy: DeployFunction;
  upgradeProxy: UpgradeFunction;
  validateImplementation: ValidateImplementationFunction;
  validateUpgrade: ValidateUpgradeFunction;
  deployImplementation: DeployImplementationFunction;
  prepareUpgrade: PrepareUpgradeFunction;
  deployBeacon: DeployBeaconFunction;
  deployBeaconProxy: DeployBeaconProxyFunction;
  upgradeBeacon: UpgradeBeaconFunction;
  deployProxyAdmin: DeployAdminFunction;
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

export interface PlatformHardhatUpgrades extends HardhatUpgrades {
  deployContract: DeployContractFunction;
  proposeUpgrade: ProposeUpgradeFunction;
  getDefaultApprovalProcess: GetDefaultApprovalProcessFunction;
}

interface RunCompilerArgs {
  input: SolcInput;
  solcVersion: string;
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

    // We iterate through each source from the original solc input.
    // For each source, delete all functions.
    // If a source has namespaces, we also modify the source to inject variables that reference the namespace structs.
    const modifiedInput: SolcInput = JSON.parse(JSON.stringify(args.input));
    for (const [sourcePath /*source*/] of Object.entries(modifiedInput.sources)) {
      // TODO this is a hack just for Namespaced.sol to be used in the testcase in namespaced.js
      if (sourcePath === 'contracts/Namespaced.sol') {
        const replacement = `\
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Example {
    MainStorage $dummy;

    /// @custom:storage-location erc7201:example.main
    struct MainStorage {
        uint256 x;
        uint256 y;
    }

    // keccak256(abi.encode(uint256(keccak256("example.main")) - 1));
    bytes32 private constant MAIN_STORAGE_LOCATION =
        0x183a6125c38840424c4a85fa12bab2ab606c4b6d0e7cc73c0c06ba5300eab5da;
}

contract ExampleV2_Ok {
    MainStorage $dummy;

    /// @custom:storage-location erc7201:example.main
    struct MainStorage {
        uint256 x;
        uint256 y;
        uint256 z;
    }

    // keccak256(abi.encode(uint256(keccak256("example.main")) - 1));
    bytes32 private constant MAIN_STORAGE_LOCATION =
        0x183a6125c38840424c4a85fa12bab2ab606c4b6d0e7cc73c0c06ba5300eab5da;
}

contract ExampleV2_Bad {
    MainStorage $dummy;

    /// @custom:storage-location erc7201:example.main
    struct MainStorage {
        uint256 y;
    }

    // keccak256(abi.encode(uint256(keccak256("example.main")) - 1));
    bytes32 private constant MAIN_STORAGE_LOCATION =
        0x183a6125c38840424c4a85fa12bab2ab606c4b6d0e7cc73c0c06ba5300eab5da;
}

contract RecursiveStruct {
  MainStorage $dummy;

  struct MyStruct {
      uint128 a;
      uint256 b;
  }

  /// @custom:storage-location erc7201:example.main
  struct MainStorage {
      MyStruct s;
      uint256 y;
  }
}

contract RecursiveStructV2_Ok {
  MainStorage $dummy;

  struct MyStruct {
      uint128 a;
      uint128 a2;
      uint256 b;
  }

  /// @custom:storage-location erc7201:example.main
  struct MainStorage {
      MyStruct s;
      uint256 y;
  }
}

contract RecursiveStructV2_Bad {
  MainStorage $dummy;

  struct MyStruct {
      uint128 a;
      uint256 b;
      uint256 c;
  }

  /// @custom:storage-location erc7201:example.main
  struct MainStorage {
      MyStruct s;
      uint256 y;
  }
}
`;
        modifiedInput.sources[sourcePath].content = replacement;
      }
    }

    console.log('Compiling modified contracts for namespaces...');
    const { output: modifiedOutput } = await runSuper({ ...args, input: modifiedInput });
    console.log('Done compiling modified contracts for namespaces.');

    const validations = validate(output, decodeSrc, args.solcVersion, modifiedOutput);
    await writeValidations(hre, validations);
  }

  return { output, solcBuild };
});

extendEnvironment(hre => {
  hre.upgrades = lazyObject((): HardhatUpgrades => {
    return makeUpgradesFunctions(hre);
  });

  hre.platform = lazyObject((): PlatformHardhatUpgrades => {
    return makePlatformFunctions(hre);
  });
});

extendConfig((config: HardhatConfig) => {
  // Accumulate references to all the compiler settings, including overrides
  const settings = [];
  for (const compiler of config.solidity.compilers) {
    compiler.settings ??= {};
    settings.push(compiler.settings);
  }
  for (const compilerOverride of Object.values(config.solidity.overrides)) {
    compilerOverride.settings ??= {};
    settings.push(compilerOverride.settings);
  }

  // Enable storage layout in all of them
  for (const setting of settings) {
    setting.outputSelection ??= {};
    setting.outputSelection['*'] ??= {};
    setting.outputSelection['*']['*'] ??= [];

    if (!setting.outputSelection['*']['*'].includes('storageLayout')) {
      setting.outputSelection['*']['*'].push('storageLayout');
    }
  }
});

if (tryRequire('@nomicfoundation/hardhat-verify')) {
  subtask('verify:etherscan').setAction(async (args, hre, runSuper) => {
    const { verify } = await import('./verify-proxy');
    return await verify(args, hre, runSuper);
  });
}

function makeFunctions(hre: HardhatRuntimeEnvironment, platform: boolean) {
  const {
    silenceWarnings,
    getAdminAddress,
    getImplementationAddress,
    getBeaconAddress,
  } = require('@openzeppelin/upgrades-core');
  const { makeDeployProxy } = require('./deploy-proxy');
  const { makeUpgradeProxy } = require('./upgrade-proxy');
  const { makeValidateImplementation } = require('./validate-implementation');
  const { makeValidateUpgrade } = require('./validate-upgrade');
  const { makeDeployImplementation } = require('./deploy-implementation');
  const { makePrepareUpgrade } = require('./prepare-upgrade');
  const { makeDeployBeacon } = require('./deploy-beacon');
  const { makeDeployBeaconProxy } = require('./deploy-beacon-proxy');
  const { makeUpgradeBeacon } = require('./upgrade-beacon');
  const { makeForceImport } = require('./force-import');
  const { makeChangeProxyAdmin, makeTransferProxyAdminOwnership, makeGetInstanceFunction } = require('./admin');

  return {
    silenceWarnings,
    deployProxy: makeDeployProxy(hre, platform),
    upgradeProxy: makeUpgradeProxy(hre, platform), // block on platform
    validateImplementation: makeValidateImplementation(hre),
    validateUpgrade: makeValidateUpgrade(hre),
    deployImplementation: makeDeployImplementation(hre, platform),
    prepareUpgrade: makePrepareUpgrade(hre, platform),
    deployBeacon: makeDeployBeacon(hre, platform), // block on platform
    deployBeaconProxy: makeDeployBeaconProxy(hre, platform),
    upgradeBeacon: makeUpgradeBeacon(hre, platform), // block on platform
    deployProxyAdmin: makeDeployProxyAdmin(hre, platform), // block on platform
    forceImport: makeForceImport(hre),
    admin: {
      getInstance: makeGetInstanceFunction(hre),
      changeProxyAdmin: makeChangeProxyAdmin(hre, platform), // block on platform
      transferProxyAdminOwnership: makeTransferProxyAdminOwnership(hre, platform), // block on platform
    },
    erc1967: {
      getAdminAddress: (proxyAddress: string) => getAdminAddress(hre.network.provider, proxyAddress),
      getImplementationAddress: (proxyAddress: string) => getImplementationAddress(hre.network.provider, proxyAddress),
      getBeaconAddress: (proxyAddress: string) => getBeaconAddress(hre.network.provider, proxyAddress),
    },
    beacon: {
      getImplementationAddress: (beaconAddress: string) =>
        getImplementationAddressFromBeacon(hre.network.provider, beaconAddress),
    },
  };
}

function makeUpgradesFunctions(hre: HardhatRuntimeEnvironment): HardhatUpgrades {
  return makeFunctions(hre, false);
}

function makePlatformFunctions(hre: HardhatRuntimeEnvironment): PlatformHardhatUpgrades {
  const { makeDeployContract } = require('./deploy-contract');
  const { makeProposeUpgrade } = require('./platform/propose-upgrade');
  const { makeGetDefaultApprovalProcess } = require('./platform/get-default-approval-process');

  return {
    ...makeFunctions(hre, true),
    deployContract: makeDeployContract(hre, true),
    proposeUpgrade: makeProposeUpgrade(hre, true),
    getDefaultApprovalProcess: makeGetDefaultApprovalProcess(hre),
  };
}

function tryRequire(id: string) {
  try {
    require(id);
    return true;
  } catch (e: any) {
    // do nothing
  }
  return false;
}

export { UpgradeOptions } from './utils/options';
