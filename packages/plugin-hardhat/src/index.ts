/* eslint-disable @typescript-eslint/no-var-requires */

import '@nomicfoundation/hardhat-ethers';
import './type-extensions';
import { subtask, extendEnvironment, extendConfig } from 'hardhat/config';
import { TASK_COMPILE_SOLIDITY, TASK_COMPILE_SOLIDITY_COMPILE } from 'hardhat/builtin-tasks/task-names';
import { lazyObject } from 'hardhat/plugins';
import { HardhatConfig, HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  getImplementationAddressFromBeacon,
  getNamespacedStorageLocation,
  silenceWarnings,
  SolcInput,
  SolcOutput,
} from '@openzeppelin/upgrades-core';
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
import { isNodeType, findAll } from 'solidity-ast/utils';
import debug from './utils/debug';

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

    const namespacedInput = makeNamespacedInputCopy(args.input, output);
    const { output: namespacedOutput } = await runSuper({ ...args, input: namespacedInput });
    checkNamespacedCompileErrors(namespacedInput, namespacedOutput);

    const validations = validate(output, decodeSrc, args.solcVersion, namespacedOutput);
    await writeValidations(hre, validations);
  }

  return { output, solcBuild };
});

/**
 * Makes a copy of the contracts to add state variables for each namespaced struct definition,
 * so that the compiler will generate their types in the storage layout.
 *
 * This deletes all functions for efficiency, since they are not needed for storage layout.
 * We also need to delete modifiers and immutable variables to avoid compilation errors due to deleted
 * functions and constructors.
 */
function makeNamespacedInputCopy(input: SolcInput, output: SolcOutput) {
  const modifiedInput: SolcInput = JSON.parse(JSON.stringify(input));
  for (const [sourcePath] of Object.entries(modifiedInput.sources)) {
    const source = modifiedInput.sources[sourcePath];
    if (source.content === undefined) {
      continue;
    }

    // Collect all contract definitions
    const contractDefs = [];
    for (const contractDef of findAll('ContractDefinition', output.sources[sourcePath].ast)) {
      contractDefs.push(contractDef);
    }

    // Iterate backwards so we can delete source code without affecting remaining indices
    for (let i = contractDefs.length - 1; i >= 0; i--) {
      const contractDef = contractDefs[i];
      const nodes = contractDef.nodes;
      for (let j = nodes.length - 1; j >= 0; j--) {
        const node = nodes[j];
        if (
          isNodeType('FunctionDefinition', node) ||
          isNodeType('ModifierDefinition', node) ||
          (isNodeType('VariableDeclaration', node) && node.mutability === 'immutable')
        ) {
          const orig = Buffer.from(source.content);

          const [start, length] = node.src.split(':').map(Number);
          let end = start + length;

          // If the next character is a semicolon (e.g. for immutable variables), delete it too
          if (end + 1 < orig.length && orig.subarray(end, end + 1).toString() === ';') {
            end += 1;
          }

          // Delete the source code segment
          const buf = Buffer.concat([orig.subarray(0, start), orig.subarray(end)]);

          source.content = buf.toString();
        } else if (isNodeType('StructDefinition', node)) {
          const storageLocation = getNamespacedStorageLocation(node);
          if (storageLocation !== undefined) {
            const orig = Buffer.from(source.content);

            const [start, length] = node.src.split(':').map(Number);
            const end = start + length;

            const structName = node.name;
            const variableName = `$${structName}`;

            // Insert the variable declaration for the namespaced struct
            const buf = Buffer.concat([
              orig.subarray(0, end),
              Buffer.from(` ${structName} ${variableName};`),
              orig.subarray(end),
            ]);

            source.content = buf.toString();
          }
        }
      }
    }
  }
  return modifiedInput;
}

/**
 * Checks for compile errors in the modified contracts for namespaced storage.
 * If errors are found, throws an error with the compile error messages, and logs
 * the modified contract source code as debug.
 */
function checkNamespacedCompileErrors(namespacedInput: SolcInput, namespacedOutput: SolcOutput) {
  const errors = [];
  if (namespacedOutput.errors !== undefined) {
    for (const error of namespacedOutput.errors) {
      if (error.severity === 'error') {
        const msg = error.formattedMessage;

        debug('Compile error in modified contract for namespaced storage.');
        debug('Error:', msg);
        if (error.sourceLocation !== undefined && error.sourceLocation.file in namespacedInput.sources) {
          debug('Modified contract source:', namespacedInput.sources[error.sourceLocation.file].content);
        }

        errors.push(msg);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`Failed to compile modified contracts for namespaced storage:\n\n${errors.join('\n')}`);
  }
}

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
