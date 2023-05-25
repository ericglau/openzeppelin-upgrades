
import {
  solcInputOutputDecoder,
  getContractVersion,
  getStorageLayout,
  validate,
  ValidationOptions,
  withValidationDefaults,
  StorageLayout,
  Version,
  SolcOutput,
  SolcInput,
  assertUpgradeSafe,
  assertStorageUpgradeSafe,
  ValidationData,
  ValidationRunData,
  UpgradesError,
} from '.';
import { Node } from 'solidity-ast/node';
import { findAll } from 'solidity-ast/utils';

import { ContractDefinition } from 'solidity-ast';

export interface BuildInfoFile {
  /**
   * The solc input from the Solidity compiler.
   */
  input: SolcInput;

  /**
   * The solc output from the Solidity compiler.
   */
  output: SolcOutput;
}

export interface UpgradeSafetyReport {
  /**
   * The fully qualified name of the contract.
   */
  contract: string;

  /**
   * The fully qualified name of the contract that this contract is meant to be upgraded from, if any.
   */
  reference?: string;

  /**
   * If standalone upgrade safety checks failed, this will contain an Error object where the message describes all of the errors found in the contract.
   */
  standaloneErrors?: UpgradesError;

  /**
   * If storage layout comparisons failed when compared to the reference contract, this will contain an Error object where the message describes all of the errors found in the storage layout comparison.
   */
  storageLayoutErrors?: UpgradesError;
}

interface SourceContract {
  node: ContractDefinition;
  name: string;
  fullyQualifiedName: string;
  validationData: ValidationRunData;
}

export function validateUpgradeSafety(buildInfoFiles: BuildInfoFile[]): UpgradeSafetyReport[] {
  const sourceContracts: SourceContract[] = [];
  for (const buildInfoFile of buildInfoFiles) {
    const validations = runValidations(buildInfoFile.input, buildInfoFile.output);
    addContractsFromBuildInfo(buildInfoFile, validations, sourceContracts);
  }

  return getContractValidationReports(sourceContracts);
}

function getContractValidationReports(sourceContracts: SourceContract[]) {
  const validationReports: UpgradeSafetyReport[] = [];
  for (const sourceContract of sourceContracts) {
    const upgradeability = getUpgradeability(sourceContract, sourceContracts);
    if (upgradeability.upgradeable) {
      const reference = upgradeability.referenceContract;
      const uups = upgradeability.uups;
      const kind = uups ? 'uups' : 'transparent';

      // TODO take opts from command line
      const report = getContractValidationReport(sourceContract, reference, { kind: kind });
      if (report !== undefined && (report.standaloneErrors !== undefined || report.storageLayoutErrors !== undefined)) {
        validationReports.push(report);
      }
    }
  }
  return validationReports;
}

function addContractsFromBuildInfo(
  buildInfoFile: BuildInfoFile,
  validationData: ValidationRunData,
  sourceContracts: SourceContract[],
) {
  for (const sourcePath in buildInfoFile.output.sources) {
    const ast = buildInfoFile.output.sources[sourcePath].ast;

    for (const contractDef of findAll('ContractDefinition', ast)) {
      const fullyQualifiedName = getFullyQualifiedName(sourcePath, contractDef.name);
      console.log('Found: ' + fullyQualifiedName);

      sourceContracts.push({
        node: contractDef,
        name: contractDef.name,
        fullyQualifiedName,
        validationData: validationData,
      });
    }
  }
}

/**
 * For each upgradeable contract, check upgrade safety by itself or compare with reference contract.
 * If not ok, throw error report.
 *
 * @param sourceContracts Array of source contracts.
 * @param opts Validation options.
 * @returns false if contract is not upgrade safe
 */
function getContractValidationReport(
  contract: SourceContract,
  referenceContract: SourceContract | undefined,
  opts: ValidationOptions,
): UpgradeSafetyReport | undefined {
  let version;
  try {
    version = getContractVersion(contract.validationData, contract.name);
  } catch (e: any) {
    if (e.message.endsWith('is abstract')) {
      // Skip abstract upgradeable contracts - they will be validated as part of their caller contracts
      // for the functions that are in use.
      return undefined;
    } else {
      throw e;
    }
  }

  const report: UpgradeSafetyReport = {
    contract: contract.fullyQualifiedName,
    reference: referenceContract?.fullyQualifiedName,
  };

  console.log('Checking: ' + contract.fullyQualifiedName);
  const standaloneError = logStandaloneErrors(contract.validationData, version, opts);

  if (opts.unsafeSkipStorageCheck !== true && referenceContract !== undefined) {
    const layout = getStorageLayout(contract.validationData, version);

    const referenceVersion = getContractVersion(referenceContract.validationData, referenceContract.name);
    const referenceLayout = getStorageLayout(referenceContract.validationData, referenceVersion);

    const storageUpgradeError = logStorageUpgradeErrors(referenceLayout, layout, withValidationDefaults(opts));

    if (standaloneError || storageUpgradeError) {
      report.standaloneErrors = standaloneError;
      report.storageLayoutErrors = storageUpgradeError;
      return report;
    } else {
      console.log('Passed: from ' + referenceContract.fullyQualifiedName + ' to ' + contract.fullyQualifiedName);
    }
  } else {
    if (standaloneError) {
      report.standaloneErrors = standaloneError;
      return report;
    } else {
      console.log('Passed: ' + contract.fullyQualifiedName);
    }
  }
}

export function logStandaloneErrors(
  data: ValidationData,
  version: Version,
  opts: ValidationOptions,
): UpgradesError | undefined {
  let error = undefined;
  try {
    assertUpgradeSafe(data, version, withValidationDefaults(opts));
  } catch (e: any) {
    if (e instanceof UpgradesError) {
      error = e;
      console.error(e);
    } else {
      throw e;
    }
  }
  return error;
}

export function logStorageUpgradeErrors(
  referenceLayout: StorageLayout,
  layout: StorageLayout,
  opts: ValidationOptions,
): UpgradesError | undefined {
  let error = undefined;
  try {
    assertStorageUpgradeSafe(referenceLayout, layout, withValidationDefaults(opts));
  } catch (e: any) {
    if (e instanceof UpgradesError) {
      error = e;
      console.error(e);
    } else {
      throw e;
    }
  }
  return error;
}

function getFullyQualifiedName(source: string, contractName: string) {
  return `${source}:${contractName}`;
}

interface UpgradesAnnotation {
  upgradeable: boolean;
  referenceName?: string;
}

interface Upgradeability {
  upgradeable: boolean;
  referenceContract?: SourceContract;
  uups: boolean;
}

function getUpgradeability(contract: SourceContract, allContracts: SourceContract[]): Upgradeability {
  const fullContractName = contract.fullyQualifiedName;
  const c = contract.validationData[fullContractName];
  if (c === undefined) {
    return { upgradeable: false, uups: false };
  }
  const inherit = c.inherit;

  const upgradesAnnotation = readUpgradesAnnotation(contract);
  if (upgradesAnnotation.upgradeable) {
    // TODO even if reference contract does not have upgradeability annotation, should we still check it?
    let referenceContract = undefined;
    let isReferenceUUPS = false;
    if (upgradesAnnotation.referenceName !== undefined) {
      referenceContract = getReferenceContract(upgradesAnnotation.referenceName, contract, allContracts);
      isReferenceUUPS = isUUPS(referenceContract.validationData, referenceContract.fullyQualifiedName);
    }

    return {
      upgradeable: true,
      uups: isReferenceUUPS || isUUPS(contract.validationData, fullContractName), // if reference OR current contract is UUPS, set opts.kind to 'uups'
      referenceContract: referenceContract,
    };
  } else {
    const initializable = hasInitializable(inherit);
    const uups = isUUPS(contract.validationData, fullContractName);
    return {
      upgradeable: initializable || uups,
      uups: uups,
    };
  }
}

function getReferenceContract(reference: string, origin: SourceContract, allContracts: SourceContract[]) {
  const referenceContract = allContracts.find(c => c.fullyQualifiedName === reference || c.name === reference);
  if (referenceContract !== undefined) {
    return referenceContract;
  } else {
    throw new Error(`Could not find contract ${reference} referenced in ${origin.fullyQualifiedName}.`);
  }
}

function readUpgradesAnnotation(contract: SourceContract): UpgradesAnnotation {
  const node = contract.node;

  const hasUpgradeAnnotation = hasUpgradesAnnotation(node); // TODO if this has args, throw error
  const upgradesFrom = getUpgradesFrom(contract);
  if (upgradesFrom !== undefined) {
    return {
      upgradeable: true,
      referenceName: upgradesFrom,
    };
  } else {
    return {
      upgradeable: hasUpgradeAnnotation,
    };
  }
}

function hasUpgradesAnnotation(node: Node): boolean {
  if ('documentation' in node) {
    const doc = typeof node.documentation === 'string' ? node.documentation : node.documentation?.text ?? '';
    const regex = new RegExp(/^\s*(@custom:oz-upgrades)(\s|$)/m);
    return regex.test(doc);
  } else {
    return false;
  }
}

// TODO combine with above
function hasUpgradesFromAnnotation(node: Node): boolean {
  if ('documentation' in node) {
    const doc = typeof node.documentation === 'string' ? node.documentation : node.documentation?.text ?? '';
    const regex = new RegExp(/^\s*(@custom:oz-upgrades-from)(\s|$)/m);
    return regex.test(doc);
  } else {
    return false;
  }
}

function getUpgradesFrom(contract: SourceContract): string | undefined {
  const node = contract.node;
  if ('documentation' in node && hasUpgradesFromAnnotation(node)) {
    // TODO combine logic of hasUpgradesFromAnnotation and the below
    const tag = 'oz-upgrades-from';
    const doc = typeof node.documentation === 'string' ? node.documentation : node.documentation?.text ?? '';
    const annotationArgs = getAnnotationArgs(doc, tag);
    if (annotationArgs.length !== 1) {
      throw new Error(
        `Invalid number of arguments for @custom:${tag} annotation in contract ${contract.fullyQualifiedName}. Expected 1, found ${annotationArgs.length}`,
      );
    }
    return annotationArgs[0];
  } else {
    return undefined;
  }
}

// ====== from packages/core/src/validate/run.ts
function* execall(re: RegExp, text: string) {
  re = new RegExp(re, re.flags + (re.sticky ? '' : 'y'));
  while (true) {
    const match = re.exec(text);
    if (match && match[0] !== '') {
      yield match;
    } else {
      break;
    }
  }
}
// ======

/**
 * Get args from the doc string matching the given tag
 */
export function getAnnotationArgs(doc: string, tag: string) {
  const result: string[] = [];
  for (const { groups } of execall(
    /^\s*(?:@(?<title>\w+)(?::(?<tag>[a-z][a-z-]*))? )?(?<args>(?:(?!^\s*@\w+)[^])*)/m,
    doc,
  )) {
    if (groups && groups.title === 'custom' && groups.tag === tag) {
      const trimmedArgs = groups.args.trim();
      if (trimmedArgs.length > 0) {
        result.push(...trimmedArgs.split(/\s+/));
      }
    }
  }

  // result.forEach(arg => {
  //   if (!(errorKinds as readonly string[]).includes(arg)) {
  //     throw new Error(`NatSpec: ${tag} argument not recognized: ${arg}`);
  //   }
  // });

  return result;
}
// ======================

/**
 * Whether inherit has any contract that ends with ":Initializable"
 * @param inherit an array of fully qualified contract names
 * @return true if inherit has any contract that ends with ":Initializable"
 */
function hasInitializable(inherit: string[]) {
  return inherit.some(c => c.endsWith(':Initializable'));
}

function getAllMethods(runValidation: ValidationRunData, fullContractName: string): string[] {
  const c = runValidation[fullContractName];
  return c.methods.concat(...c.inherit.map(name => runValidation[name].methods));
}

const upgradeToSignature = 'upgradeTo(address)';

export function isUUPS(data: ValidationRunData, fqName: string): boolean {
  const methods = getAllMethods(data, fqName);
  return methods.includes(upgradeToSignature);
}

function runValidations(solcInput: SolcInput, solcOutput: SolcOutput) {
  const decodeSrc = solcInputOutputDecoder(solcInput, solcOutput);
  const validation = validate(solcOutput, decodeSrc);
  return validation;
}
