import {
  getContractVersion,
  getStorageLayout,
  ValidationOptions,
  withValidationDefaults,
  StorageLayout,
  Version,
  assertUpgradeSafe,
  assertStorageUpgradeSafe,
  ValidationData,
  UpgradesError,
  ValidateUpgradeSafetyOptions,
} from '..';

import { getUpgradeabilityAssessment } from './upgradeability';
import { SourceContract } from './validations';

/**
 * Error report for a contract that failed upgrade safety checks.
 */
export interface ContractErrorReport {
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

/**
 * Gets error reports for contracts that failed upgrade safety checks.
 * 
 * @param sourceContracts The source contracts to check, which must include all contracts that are referenced by the given contracts. Can also include non-upgradeable contracts, which will be ignored.
 * @param opts The validation options.
 * @returns Error reports for contracts that failed upgrade safety checks.
 */
export function getReports(sourceContracts: SourceContract[], opts: ValidateUpgradeSafetyOptions) {
  const errorReports: ContractErrorReport[] = [];
  for (const sourceContract of sourceContracts) {
    const upgradeabilityAssessment = getUpgradeabilityAssessment(sourceContract, sourceContracts);
    if (upgradeabilityAssessment.upgradeable) {
      const reference = upgradeabilityAssessment.referenceContract;
      const uups = upgradeabilityAssessment.uups;
      const kind = uups ? 'uups' : 'transparent';

      const report = getContractErrorReport(sourceContract, reference, { ...opts, kind: kind });
      if (report !== undefined && (report.standaloneErrors !== undefined || report.storageLayoutErrors !== undefined)) {
        errorReports.push(report);
      }
    }
  }
  return errorReports;
}

function getContractErrorReport(
  contract: SourceContract,
  referenceContract: SourceContract | undefined,
  opts: ValidationOptions,
): ContractErrorReport | undefined {
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
  const standaloneErrors = getStandaloneErrors(contract.validationData, version, opts);

  if (opts.unsafeSkipStorageCheck !== true && referenceContract !== undefined) {
    const layout = getStorageLayout(contract.validationData, version);

    const referenceVersion = getContractVersion(referenceContract.validationData, referenceContract.name);
    const referenceLayout = getStorageLayout(referenceContract.validationData, referenceVersion);

    const storageLayoutErrors = getStorageLayoutErrors(referenceLayout, layout, withValidationDefaults(opts));

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

function getStandaloneErrors(
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

function getStorageLayoutErrors(
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
