import _test, { TestFn } from 'ava';
import { artifacts } from 'hardhat';

import {
  validate,
  getStorageLayout,
  getContractVersion,
  assertUpgradeSafe,
  ValidationOptions,
  RunValidation,
} from './validate';
import { solcInputOutputDecoder } from './src-decoder';

interface Context {
  validation: RunValidation;
}

const test = _test as TestFn<Context>;

test.before(async t => {
  const contracts = [
    'contracts/test/ignore-errors/SafeContract.sol:SafeContract',
    'contracts/test/ignore-errors/SafeContractWithFreeFunctionCall.sol:SafeContractWithFreeFunctionCall',
    'contracts/test/ignore-errors/SafeContractWithLibraryCall.sol:SafeContractWithLibraryCall',
    'contracts/test/ignore-errors/SafeContractWithLibraryImport.sol:SafeContractWithLibraryImport',
    'contracts/test/ignore-errors/SafeContractWithLibraryUsingFor.sol:SafeContractWithLibraryUsingFor',
    'contracts/test/ignore-errors/SafeContractWithTransitiveLibraryCall.sol:SafeContractWithTransitiveLibraryCall',
    'contracts/test/ignore-errors/SafeContractWithParentCall.sol:SafeContractWithParentCall',
    'contracts/test/ignore-errors/UnsafeContract.sol:UnsafeContract',
    'contracts/test/ignore-errors/UnsafeContractWithFreeFunctionCall.sol:UnsafeContractWithFreeFunctionCall',
    'contracts/test/ignore-errors/UnsafeContractWithLibraryCall.sol:UnsafeContractWithLibraryCall',
    'contracts/test/ignore-errors/UnsafeContractWithLibraryUsingFor.sol:UnsafeContractWithLibraryUsingFor',
    'contracts/test/ignore-errors/UnsafeContractWithTransitiveLibraryCall.sol:UnsafeContractWithTransitiveLibraryCall',
    'contracts/test/ignore-errors/UnsafeContractWithParentCall.sol:UnsafeContractWithParentCall',
    'contracts/test/ignore-errors/UnsafeContractWithInheritedParent.sol:UnsafeContractWithInheritedParent',
    'contracts/test/ignore-errors/UnsafeContractWithInheritedTransitiveParent.sol:UnsafeContractWithInheritedTransitiveParent',
  ];

  t.context.validation = {} as RunValidation;
  for (const contract of contracts) {
    const buildInfo = await artifacts.getBuildInfo(contract);
    if (buildInfo === undefined) {
      throw new Error(`Build info not found for contract ${contract}`);
    }
    const solcOutput = buildInfo.output;
    const solcInput = buildInfo.input;
    const decodeSrc = solcInputOutputDecoder(solcInput, solcOutput);
    Object.assign(t.context.validation, validate(solcOutput, decodeSrc));
  }
});

function testValid(name: string, kind: ValidationOptions['kind'], valid: boolean) {
  testOverride(name, kind, {}, valid);
}

function testOverride(name: string, kind: ValidationOptions['kind'], opts: ValidationOptions, valid: boolean) {
  const optKeys = Object.keys(opts);
  const describeOpts = optKeys.length > 0 ? '(' + optKeys.join(', ') + ')' : '';
  const testName = [valid ? 'accepts' : 'rejects', kind, name, describeOpts].join(' ');
  test(testName, t => {
    const version = getContractVersion(t.context.validation, name);
    const assertUpgSafe = () => assertUpgradeSafe([t.context.validation], version, { kind, ...opts });
    if (valid) {
      t.notThrows(assertUpgSafe);
    } else {
      t.throws(assertUpgSafe);
    }
  });
}

testValid('SafeContract', 'transparent', true);
testValid('SafeContractWithFreeFunctionCall', 'transparent', true);
testValid('SafeContractWithLibraryCall', 'transparent', true);
testValid('SafeContractWithLibraryImport', 'transparent', true);
testValid('SafeContractWithLibraryUsingFor', 'transparent', true);
testValid('SafeContractWithTransitiveLibraryCall', 'transparent', true);
testValid('SafeContractWithParentCall', 'transparent', true);
testValid('UnsafeContract', 'transparent', false);
testValid('UnsafeContractWithFreeFunctionCall', 'transparent', false);
testValid('UnsafeContractWithLibraryCall', 'transparent', false);
testValid('UnsafeContractWithLibraryUsingFor', 'transparent', false);
testValid('UnsafeContractWithTransitiveLibraryCall', 'transparent', false);
testValid('UnsafeContractWithParentCall', 'transparent', false);
testValid('UnsafeContractWithInheritedParent', 'transparent', false);
testValid('UnsafeContractWithInheritedTransitiveParent', 'transparent', false);
