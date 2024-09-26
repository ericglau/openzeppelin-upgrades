import test, { ExecutionContext } from 'ava';
import { artifacts } from 'hardhat';

import { validate } from './validate';
import { solcInputOutputDecoder } from './src-decoder';

test('namespace outside contract', async t => {
  const contract = 'contracts/test/NamespacedOutsideContract.sol:Example';

  await assertNamespaceOutsideContractError(
    contract,
    t,
    'contracts/test/NamespacedOutsideContract.sol:7: Namespace struct MainStorage is defined outside of a contract',
  );
});

test('namespace in library', async t => {
  const contract = 'contracts/test/NamespacedInLibrary.sol:Example';

  await assertNamespaceOutsideContractError(
    contract,
    t,
    'contracts/test/NamespacedInLibrary.sol:8: Namespace struct MainStorage is defined outside of a contract',
  );
});

test('namespace in interface', async t => {
  const contract = 'contracts/test/NamespacedInInterface.sol:Example';

  await assertNamespaceOutsideContractError(
    contract,
    t,
    'contracts/test/NamespacedInInterface.sol:8: Namespace struct MainStorage is defined outside of a contract',
  );
});

async function assertNamespaceOutsideContractError(
  contract: string,
  t: ExecutionContext<unknown>,
  expectedErrorSubstring: string,
) {
  const buildInfo = await artifacts.getBuildInfo(contract);
  if (buildInfo === undefined) {
    throw new Error(`Build info not found for contract ${contract}`);
  }
  const solcOutput = buildInfo.output;
  const solcInput = buildInfo.input;
  const decodeSrc = solcInputOutputDecoder(solcInput, solcOutput);
  const error = t.throws(() => validate(solcOutput, decodeSrc));
  t.assert(error?.message.includes(expectedErrorSubstring), error?.message);
}
