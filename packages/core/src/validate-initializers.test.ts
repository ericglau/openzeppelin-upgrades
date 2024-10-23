import _test, { TestFn } from 'ava';
import { artifacts } from 'hardhat';

import {
  validate,
  getStorageLayout,
  getContractVersion,
  assertUpgradeSafe,
  ValidationOptions,
  RunValidation,
  ValidationErrors,
} from './validate';
import { solcInputOutputDecoder } from './src-decoder';

interface Context {
  validation: RunValidation;
}

const test = _test as TestFn<Context>;

test.before(async t => {
  const contracts = [
    'contracts/test/ValidationsInitializer.sol:NoInitializer',
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

function testValid(name: string, kind: ValidationOptions['kind'], valid: boolean, numExpectedErrors?: number) {
  testOverride(name, kind, {}, valid, numExpectedErrors);
}

function testOverride(
  name: string,
  kind: ValidationOptions['kind'],
  opts: ValidationOptions,
  valid: boolean,
  numExpectedErrors?: number,
) {
  if (numExpectedErrors !== undefined && numExpectedErrors > 0 && valid) {
    throw new Error('Cannot expect errors for a valid contract');
  }

  const optKeys = Object.keys(opts);
  const describeOpts = optKeys.length > 0 ? '(' + optKeys.join(', ') + ')' : '';
  const testName = [valid ? 'accepts' : 'rejects', kind, name, describeOpts].join(' ');
  test(testName, t => {
    const version = getContractVersion(t.context.validation, name);
    const assertUpgSafe = () => assertUpgradeSafe([t.context.validation], version, { kind, ...opts });
    if (valid) {
      t.notThrows(assertUpgSafe);
    } else {
      const error = t.throws(assertUpgSafe) as ValidationErrors;
      if (numExpectedErrors !== undefined) {
        t.is(error.errors.length, numExpectedErrors);
      }
    }
  });
}

testValid('NoInitializer', 'transparent', false);

testValid('HasInitializerModifier', 'transparent', true);
testValid('HasReinitializerModifier', 'transparent', true);
testValid('HasOnlyInitializingModifier', 'transparent', true);
testValid('HasInitializeName', 'transparent', true);
testValid('HasInitializerName', 'transparent', true);
testValid('HasReinitializeName', 'transparent', true);
testValid('HasReinitializerName', 'transparent', true);

testValid('CallsParentInitializer', 'transparent', true);
testValid('CallsParentInitializerUsingSuper', 'transparent', true);
testValid('NotCallsParentInitializer', 'transparent', false);