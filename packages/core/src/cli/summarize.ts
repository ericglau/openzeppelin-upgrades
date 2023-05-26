import chalk from "chalk";
import { UpgradeSafetyErrorReport } from "./validate-build-info";

/**
 * Summarize the results of the upgrade safety checks to the console.
 * 
 * @param validationReports The array of error reports if any errors were found
 * @returns false if errors were found, true if validations passed
 */
export function summarize(validationReports: UpgradeSafetyErrorReport[]): boolean {
  if (validationReports.length > 0) {
    console.error(chalk.bold('\n=========================================================='));
    console.error(chalk.bold('\nUpgrade safety checks completed with the following errors:'));
    for (const validationReport of validationReports) {
      if (validationReport.standaloneErrors !== undefined) {
        console.error(chalk.bold(`\n- ${validationReport.contract}:\n`));
        console.error(validationReport.standaloneErrors);
      }
      if (validationReport.storageLayoutErrors !== undefined) {
        if (validationReport.reference === undefined) {
          throw new Error('Broken invariant: Storage layout errors reported without a reference contract');
        }
        console.error(chalk.bold(`\n- ${validationReport.reference} to ${validationReport.contract}:\n`));
        console.error(validationReport.storageLayoutErrors);
      }
    }
    return false;
  } else {
    console.log('\nUpgrade safety checks completed successfully.');
    return true;
  }
}