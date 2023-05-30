import chalk from "chalk";
import { ContractErrorReport } from "./contract-error-report";

/**
 * The overall validation result.
 * 
 * @param ok False if any errors were found, otherwise true.
 * @param errorReport An error report that describes all of the errors found if any, otherwise undefined.
 */
export interface SummaryReport {
  ok: boolean;
  errorReport?: string;
}

export function getSummaryReport(errorReports: ContractErrorReport[], skipSummaryLogging: boolean): SummaryReport {
  let ok;
  let errorReport;

  const lines: string[] = [];
  if (errorReports.length === 0) {
    ok = true;

    if (!skipSummaryLogging) {
      console.log('\nUpgrade safety checks completed successfully.');
    }
  } else {
    for (const validationReport of errorReports) {
      if (validationReport.standaloneErrors !== undefined) {
        lines.push(chalk.bold(`- ${validationReport.contract}: `) + validationReport.standaloneErrors.message);
      }
      if (validationReport.storageLayoutErrors !== undefined) {
        if (validationReport.reference === undefined) {
          throw new Error('Broken invariant: Storage layout errors reported without a reference contract');
        }
        lines.push(chalk.bold(`- ${validationReport.reference} to ${validationReport.contract}: `) + validationReport.storageLayoutErrors.message);
      }
    }
    ok = false;
    errorReport = lines.join('\n\n');

    if (!skipSummaryLogging) {
      console.error(chalk.bold('\n=========================================================='));
      console.error(chalk.bold('\nUpgrade safety checks completed with the following errors:'));
      console.error(`\n${errorReport}`);  
    }
  }

  return {
    ok,
    errorReport,
  };
}
