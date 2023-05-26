
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
} from '..';

import { findAll } from 'solidity-ast/utils';
import { ContractDefinition } from 'solidity-ast';

import { getFullyQualifiedName } from '../utils/contract-name';
import { getAnnotationArgs } from '../utils/annotations';

export interface BuildInfoFile {
  /**
   * The Solidity compiler input JSON object.
   */
  input: SolcInput;

  /**
   * The Solidity compiler output JSON object.
   */
  output: SolcOutput;
}

export interface UpgradeSafetyErrorReport {
  /**
   * The fully qualified name of the contract.
   */
  contract: string;

  /**
   * If there are storage layout errors, this is the fully qualified name of the contract that was used as the reference.
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

type ValidationOptionsWithoutKind = Omit<ValidationOptions, 'kind'>;

/**
 * Validates the upgrade safety of all contracts in the given build info files. Only contracts that are detected as upgradeable will be validated.
 * 
 * @param buildInfoFiles The build info files with Solidity compiler input and output.
 * @param opts Validation options, or undefined to use the default options.
 * @returns An array of error reports, one for each contract that failed validation. Returns an empty array if all contracts passed validation.
 */
export function validateUpgradeSafety(buildInfoFiles: BuildInfoFile[], opts: ValidationOptionsWithoutKind = {}): UpgradeSafetyErrorReport[] {
  const sourceContracts: SourceContract[] = [];
  for (const buildInfoFile of buildInfoFiles) {
    const validations = runValidations(buildInfoFile.input, buildInfoFile.output);
    addContractsFromBuildInfo(buildInfoFile, validations, sourceContracts);
  }

  return getReports(sourceContracts, opts);
}

interface SourceContract {
  node: ContractDefinition;
  name: string;
  fullyQualifiedName: string;
  validationData: ValidationRunData;
}

function runValidations(solcInput: SolcInput, solcOutput: SolcOutput) {
  const decodeSrc = solcInputOutputDecoder(solcInput, solcOutput);
  const validation = validate(solcOutput, decodeSrc);
  return validation;
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

function getReports(sourceContracts: SourceContract[], opts: ValidationOptionsWithoutKind) {
  const validationReports: UpgradeSafetyErrorReport[] = [];
  for (const sourceContract of sourceContracts) {
    const upgradeabilityAssessment = getUpgradeabilityAssessment(sourceContract, sourceContracts);
    if (upgradeabilityAssessment.upgradeable) {
      const reference = upgradeabilityAssessment.referenceContract;
      const uups = upgradeabilityAssessment.uups;
      const kind = uups ? 'uups' : 'transparent';

      const report = getContractReport(sourceContract, reference, { ...opts, kind: kind });
      if (report !== undefined && (report.standaloneErrors !== undefined || report.storageLayoutErrors !== undefined)) {
        validationReports.push(report);
      }
    }
  }
  return validationReports;
}

function getContractReport(
  contract: SourceContract,
  referenceContract: SourceContract | undefined,
  opts: ValidationOptions,
): UpgradeSafetyErrorReport | undefined {
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

  console.log('Checking: ' + contract.fullyQualifiedName);
  const standaloneErrors = logStandaloneErrors(contract.validationData, version, opts);

  if (opts.unsafeSkipStorageCheck !== true && referenceContract !== undefined) {
    const layout = getStorageLayout(contract.validationData, version);

    const referenceVersion = getContractVersion(referenceContract.validationData, referenceContract.name);
    const referenceLayout = getStorageLayout(referenceContract.validationData, referenceVersion);

    const storageLayoutErrors = logStorageLayoutErrors(referenceLayout, layout, withValidationDefaults(opts));

    if (standaloneErrors || storageLayoutErrors) {
      return {
        contract: contract.fullyQualifiedName,
        reference: referenceContract.fullyQualifiedName,
        standaloneErrors: standaloneErrors,
        storageLayoutErrors: storageLayoutErrors,
      }
    } else {
      console.log('Passed: from ' + referenceContract.fullyQualifiedName + ' to ' + contract.fullyQualifiedName);
    }
  } else {
    if (standaloneErrors) {
      return {
        contract: contract.fullyQualifiedName,
        standaloneErrors: standaloneErrors,
      }
    } else {
      console.log('Passed: ' + contract.fullyQualifiedName);
    }
  }
}

function captureUpgradesError(e: any) {
  if (e instanceof UpgradesError) {
    console.error(e);
    return e;
  } else {
    throw e;
  }
}

function logStandaloneErrors(
  data: ValidationData,
  version: Version,
  opts: ValidationOptions,
): UpgradesError | undefined {
  try {
    assertUpgradeSafe(data, version, withValidationDefaults(opts));
  } catch (e: any) {
    return captureUpgradesError(e);
  }
}

function logStorageLayoutErrors(
  referenceLayout: StorageLayout,
  layout: StorageLayout,
  opts: ValidationOptions,
): UpgradesError | undefined {
  try {
    assertStorageUpgradeSafe(referenceLayout, layout, withValidationDefaults(opts));
  } catch (e: any) {
    return captureUpgradesError(e);
  }
}

interface AnnotationAssessment {
  upgradeable: boolean;
  referenceName?: string;
}

interface UpgradeabilityAssessment {
  upgradeable: boolean;
  referenceContract?: SourceContract;
  uups?: boolean;
}

function getUpgradeabilityAssessment(contract: SourceContract, allContracts: SourceContract[]): UpgradeabilityAssessment {
  const fullContractName = contract.fullyQualifiedName;
  const c = contract.validationData[fullContractName];
  if (c === undefined) {
    return { upgradeable: false };
  }
  const inherit = c.inherit;

  const annotationAssessment = getAnnotationAssessment(contract);
  if (annotationAssessment.upgradeable) {
    let referenceContract = undefined;
    let isReferenceUUPS = false;
    if (annotationAssessment.referenceName !== undefined) {
      referenceContract = getReferenceContract(annotationAssessment.referenceName, contract, allContracts);
      isReferenceUUPS = isUUPS(referenceContract.validationData, referenceContract.fullyQualifiedName);
    }

    return {
      upgradeable: true,
      referenceContract: referenceContract,
      uups: isReferenceUUPS || isUUPS(contract.validationData, fullContractName), // if reference OR current contract is UUPS, perform validations for UUPS
    };
  } else {
    const initializable = hasInitializable(inherit);
    const uups = isUUPS(contract.validationData, fullContractName);
    return {
      upgradeable: initializable || uups,
      uups: uups, // if current contract is UUPS, perform validations for UUPS
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

function getAnnotationAssessment(contract: SourceContract): AnnotationAssessment {
  const node = contract.node;

  if ('documentation' in node) {
    const doc = typeof node.documentation === 'string' ? node.documentation : node.documentation?.text ?? '';

    const tag = 'oz-upgrades';
    const hasUpgradeAnnotation = hasAnnotationTag(doc, tag);
    if (hasUpgradeAnnotation) {
      getAndValidateAnnotationArgs(doc, tag, contract, 0);
    }
  
    const upgradesFrom = getUpgradesFrom(doc, contract);
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
  } else {
    return {
      upgradeable: false,
    }
  }
}

function getAndValidateAnnotationArgs(doc: string, tag: string, contract: SourceContract, expectedLength: number) {
  const annotationArgs = getAnnotationArgs(doc, tag, undefined);
  if (annotationArgs.length !== expectedLength) {
    throw new Error(
      `Invalid number of arguments for @custom:${tag} annotation in contract ${contract.fullyQualifiedName}. Expected ${expectedLength}, found ${annotationArgs.length}`
    );
  }
  return annotationArgs;
}

function hasAnnotationTag(doc: string, tag: string): boolean {
  const regex = new RegExp(`^\\s*(@custom:${tag})(\\s|$)`, 'm');
  return regex.test(doc);
}

function getUpgradesFrom(doc: string, contract: SourceContract): string | undefined {
  const tag = 'oz-upgrades-from';
  if (hasAnnotationTag(doc, tag)) {
    const annotationArgs = getAndValidateAnnotationArgs(doc, tag, contract, 1);
    return annotationArgs[0];
  } else {
    return undefined;
  }
}

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


