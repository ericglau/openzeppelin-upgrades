import test from 'ava';
import { artifacts } from 'hardhat';

import { validate } from './validate';
import { solcInputOutputDecoder } from './src-decoder';

function testCompileRunValidationError(contractName: string, expectedErrorContains: string) {
  test(contractName, async t => {
    const fullyQualifiedContractName = `${TEST_DIR}${contractName}.sol:${contractName}`;

    const buildInfo = await artifacts.getBuildInfo(fullyQualifiedContractName);
    if (buildInfo === undefined) {
      throw new Error(`Build info not found for contract ${fullyQualifiedContractName}`);
    }
    const solcOutput = buildInfo.output;
    const solcInput = buildInfo.input;
    const decodeSrc = solcInputOutputDecoder(solcInput, solcOutput);
    const error = t.throws(() => validate(solcOutput, decodeSrc));
    if (error === undefined) {
      t.fail('Error not thrown. Expected an error containing: ' + expectedErrorContains);
    }
    t.true(
      error.message.includes(expectedErrorContains),
      `Expected error message to contain: ${expectedErrorContains}, got: ${error.message}`,
    );
  });
}

const TEST_DIR = 'contracts/test/validate-as-initializer-invalid/';

testCompileRunValidationError(
  'ValidateAsInitializer_ArgsNotAllowed',
  '@custom:oz-upgrades-validate-as-initializer annotation cannot be used on virtual functions without a body',
);

testCompileRunValidationError(
  'ValidateAsInitializer_AbstractNotAllowed',
  '@custom:oz-upgrades-validate-as-initializer annotation cannot be used on unimplemented functions in abstract contracts',
);

testCompileRunValidationError(
  'ValidateAsInitializer_PrivateNotAllowed',
  '@custom:oz-upgrades-validate-as-initializer annotation cannot be used on virtual functions without a body',
);
