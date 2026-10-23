import _test, { TestFn } from 'ava';
import { artifacts, run } from 'hardhat';
import {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
  TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
} from 'hardhat/builtin-tasks/task-names';
import { SolcBuild } from 'hardhat/types/builtin-tasks';
import { astDereferencer, findAll } from 'solidity-ast/utils';

import { SolcInput, SolcOutput } from './solc-api';
import { validate, ValidationRunData } from './validate';
import { solcInputOutputDecoder } from './src-decoder';
import { makeNamespacedInput, trySanitizeNatSpec } from './utils/make-namespaced';
import { extractStorageLayout } from './storage/extract';

const source = 'contracts/test/NamespacedSameStructName.sol';

interface Context {
  input: SolcInput;
  output: SolcOutput;
  namespacedOutput: SolcOutput;
  validation: ValidationRunData;
}

const test = _test as TestFn<Context>;

test.before(async t => {
  const buildInfo = await artifacts.getBuildInfo(`${source}:UsesA`);
  if (buildInfo === undefined) {
    throw new Error('Build info not found');
  }
  const { input, output, solcVersion } = buildInfo;
  const namespacedInput = await trySanitizeNatSpec(makeNamespacedInput(input, output, solcVersion), solcVersion);
  const namespacedOutput = await hardhatCompile(namespacedInput, solcVersion);
  t.context.input = input;
  t.context.output = output;
  t.context.namespacedOutput = namespacedOutput;
  t.context.validation = validate(output, solcInputOutputDecoder(input, output), solcVersion, input, namespacedOutput);
});

async function hardhatCompile(input: SolcInput, solcVersion: string): Promise<SolcOutput> {
  const solcBuild: SolcBuild = await run(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, {
    quiet: true,
    solcVersion,
  });

  const output: SolcOutput = solcBuild.isSolcJs
    ? await run(TASK_COMPILE_SOLIDITY_RUN_SOLCJS, { input, solcJsPath: solcBuild.compilerPath })
    : await run(TASK_COMPILE_SOLIDITY_RUN_SOLC, { input, solcPath: solcBuild.compilerPath });

  const errors = output.errors?.filter(e => e.severity === 'error');
  if (errors !== undefined && errors.length > 0) {
    throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  }
  return output;
}

function getContract(output: SolcOutput, name: string) {
  const contractDef = [...findAll('ContractDefinition', output.sources[source].ast)].find(c => c.name === name);
  if (contractDef === undefined) {
    throw new Error(`Contract ${name} not found`);
  }
  return contractDef;
}

test('namespace slots come from the struct of the namespace', t => {
  // The storage layout types of both contracts include both `Base.MainStorage` structs in the same order, so checking
  // both contracts covers the namespace whose struct comes first and the one whose struct comes second
  t.like(t.context.validation[`${source}:UsesA`].layout.namespaces, {
    'erc7201:example.a': {
      length: 2,
      0: { label: 'x', slot: '0', offset: 0 },
      1: { label: 'y', slot: '0', offset: 16 },
    },
  });
  t.like(t.context.validation[`${source}:UsesB`].layout.namespaces, {
    'erc7201:example.b': {
      length: 2,
      0: { label: 'x', slot: '0', offset: 0 },
      1: { label: 'y', slot: '1', offset: 0 },
    },
  });
});

test('namespaced compilation of a different contract', t => {
  // UsesB has as many base contracts as UsesA, but they are different contracts
  const { input, output, namespacedOutput } = t.context;
  const namespacedContext = {
    contractDef: getContract(namespacedOutput, 'UsesB'),
    deref: astDereferencer(namespacedOutput),
    storageLayout: namespacedOutput.contracts[source].UsesB.storageLayout,
  };
  t.throws(
    () =>
      extractStorageLayout(
        getContract(output, 'UsesA'),
        solcInputOutputDecoder(input, output),
        astDereferencer(output),
        output.contracts[source].UsesA.storageLayout,
        namespacedContext,
      ),
    {
      message: 'Contract UsesB in the namespaced compilation does not match contract UsesA in the original compilation',
    },
  );
});
