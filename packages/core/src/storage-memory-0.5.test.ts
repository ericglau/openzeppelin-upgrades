import _test, { TestFn } from 'ava';
import { findAll } from 'solidity-ast/utils';
import { artifacts } from 'hardhat';

import { SolcOutput } from './solc-api';
import { astDereferencer } from './ast-dereferencer';
import { getStorageUpgradeErrors } from './storage';
import { extractStorageLayout } from './storage/extract';
import { BuildInfo } from 'hardhat/types';
import { stabilizeStorageLayout } from './utils/stabilize-layout';

interface Context {
  extractStorageLayout: (contract: string, withLayout?: boolean) => Promise<ReturnType<typeof extractStorageLayout>>;
}

const test = _test as TestFn<Context>;

test.before(async t => {
  const buildInfoCache: Record<string, BuildInfo | undefined> = {};
  t.context.extractStorageLayout = async (contract, withLayout = true) => {
    const [file] = contract.split('_');
    const source = `contracts/test/${file}.sol`;
    const buildInfo = (buildInfoCache[source] ??= await artifacts.getBuildInfo(`${source}:${contract}`));
    if (buildInfo === undefined) {
      throw new Error(`Build info for ${source} not found`);
    }
    const solcOutput: SolcOutput = buildInfo.output;
    for (const def of findAll('ContractDefinition', solcOutput.sources[source].ast)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const layout = solcOutput.contracts[source][def.name].storageLayout!;
      if (def.name === contract) {
        return extractStorageLayout(def, dummyDecodeSrc, astDereferencer(solcOutput), withLayout ? layout : undefined);
      }
    }
    throw new Error(`Contract ${contract} not found in ${source}`);
  };
});

const dummyDecodeSrc = () => 'file.sol:1';

test('memory 0.5.16', async t => {
  const layout = await t.context.extractStorageLayout('Memory05');
  t.snapshot(stabilizeStorageLayout(layout));
});

test('memory 0.8.9', async t => {
  const layout = await t.context.extractStorageLayout('Memory08');
  t.snapshot(stabilizeStorageLayout(layout));
});

test('string memory - upgrade from 0.5.16 to 0.8.9', async t => {
  const v1 = await t.context.extractStorageLayout('Memory05');
  const v2 = await t.context.extractStorageLayout('Memory08');

  const comparison = getStorageUpgradeErrors(v1, v2);
  t.deepEqual(comparison, []);
});
