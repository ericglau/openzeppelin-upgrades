export * from './compat';

import { UpgradesError } from '../error';
import { StorageLayout, getDetailedLayout } from './layout';
import { StorageOperation, StorageItem, StorageLayoutComparator } from './compare';
import { LayoutCompatibilityReport } from './report';
import { ValidationOptions, withValidationDefaults } from '../validate/overrides';
import { logNote, logWarning } from '../utils/log';

export function assertStorageUpgradeSafe(
  original: StorageLayout,
  updated: StorageLayout,
  unsafeAllowCustomTypes: boolean,
): void;

export function assertStorageUpgradeSafe(
  original: StorageLayout,
  updated: StorageLayout,
  opts: Required<ValidationOptions>,
): void;

export function assertStorageUpgradeSafe(
  original: StorageLayout,
  updated: StorageLayout,
  opts: Required<ValidationOptions> | boolean = false,
): void {
  if (typeof opts === 'boolean') {
    const unsafeAllowCustomTypes = opts;
    opts = withValidationDefaults({ unsafeAllowCustomTypes });
  }

  const report = getStorageUpgradeReport(original, updated, opts);

  if (!report.pass) {
    throw new StorageUpgradeErrors(report);
  }
}

export function getStorageUpgradeReport(
  original: StorageLayout,
  updated: StorageLayout,
  opts: Required<ValidationOptions>,
): LayoutCompatibilityReport {
  const originalDetailed = getDetailedLayout(original);
  const updatedDetailed = getDetailedLayout(updated);
  const comparator = new StorageLayoutComparator(opts.unsafeAllowCustomTypes, opts.unsafeAllowRenames);
  const ops = comparator.getStorageOperations(originalDetailed, updatedDetailed);

  // console.log('orig', JSON.stringify(original, null, 2));

  if (original.namespaces !== undefined) {
    for (const [namespace, origNamespaceLayout] of Object.entries(original.namespaces)) {
      const origNamespaceDetailed = getDetailedLayout({ storage: origNamespaceLayout, types: original.types }); // TODO check if types is correct.

      // console.log('original types', JSON.stringify(original.types, null, 2));
      console.log('original namespace detailed', JSON.stringify(origNamespaceDetailed, null, 2));

      const updatedNamespaceLayout = updated.namespaces?.[namespace];
      if (updatedNamespaceLayout === undefined) {
        throw new Error(`Namespace ${namespace} not found in updated layout`);
      }
      const updatedNamespaceDetailed = getDetailedLayout({ storage: updatedNamespaceLayout, types: updated.types }); // TODO check if types is correct

      // console.log('updated types', JSON.stringify(updated.types, null, 2));
      console.log('updated namespace detailed', JSON.stringify(updatedNamespaceDetailed, null, 2));

      const namespaceOps = comparator.getStorageOperations(origNamespaceDetailed, updatedNamespaceDetailed);
      console.log('namespace ops', JSON.stringify(namespaceOps, null, 2));


      ops.push(...namespaceOps);
    }
  }

  const report = new LayoutCompatibilityReport(ops);

  if (comparator.hasAllowedUncheckedCustomTypes) {
    logWarning(`Potentially unsafe deployment`, [
      `You are using \`unsafeAllowCustomTypes\` to force approve structs or enums with missing data.`,
      `Make sure you have manually checked the storage layout for incompatibilities.`,
    ]);
  } else if (opts.unsafeAllowCustomTypes) {
    logNote(`\`unsafeAllowCustomTypes\` is no longer necessary. Structs are enums are automatically checked.\n`);
  }

  return report;
}

export class StorageUpgradeErrors extends UpgradesError {
  constructor(readonly report: LayoutCompatibilityReport) {
    super(`New storage layout is incompatible`, () => report.explain());
  }
}

// Kept for backwards compatibility and to avoid rewriting tests
export function getStorageUpgradeErrors(
  original: StorageLayout,
  updated: StorageLayout,
  opts: ValidationOptions = {},
): StorageOperation<StorageItem>[] {
  try {
    assertStorageUpgradeSafe(original, updated, withValidationDefaults(opts));
  } catch (e) {
    if (e instanceof StorageUpgradeErrors) {
      return e.report.ops;
    } else {
      throw e;
    }
  }
  return [];
}
