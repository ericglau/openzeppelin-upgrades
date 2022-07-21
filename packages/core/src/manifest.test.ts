import test from 'ava';
import { Manifest, ManifestData, normalizeManifestData } from './manifest';
import fs from 'fs';

test('manifest name for a known network', t => {
  const manifest = new Manifest(1);
  t.is(manifest.file, '.openzeppelin/mainnet.json');
});

test('manifest name for an unknown network', t => {
  const id = 55555;
  const manifest = new Manifest(id);
  t.is(manifest.file, `.openzeppelin/unknown-${id}.json`);
});

test('rename manifest', async t => {
  const id = 80001;

  try {
    fs.unlinkSync('.openzeppelin/polygon-mumbai.json');
  } catch (e: any) {
    if (!e.message.includes('ENOENT')) {
      t.fail(e);
    }
  }

  const oldManifest = {
    manifestVersion: '3.2',
    impls: {},
    proxies: [],
  };
  fs.mkdirSync('.openzeppelin', { recursive: true });
  fs.writeFileSync(`.openzeppelin/unknown-${id}.json`, JSON.stringify(oldManifest, null, 2) + '\n');

  const manifest = new Manifest(id); // limitation with this test case: the file is not renamed because this is not using forNetwork

  t.is(manifest.file, `.openzeppelin/polygon-mumbai.json`);
  t.false(fs.existsSync('.openzeppelin/polygon-mumbai.json.lock'));

  await manifest.lockedRun(async () => {
    t.true(fs.existsSync('.openzeppelin/polygon-mumbai.json.lock'));
    const data = await manifest.read();
    await manifest.write(data);
  });

  t.is(manifest.file, `.openzeppelin/polygon-mumbai.json`);
  t.false(fs.existsSync('.openzeppelin/polygon-mumbai.json.lock'));

});

test('normalize manifest', t => {
  const deployment = {
    address: '0x1234',
    txHash: '0x1234',
    kind: 'uups' as const,
    layout: { types: {}, storage: [] },
    deployTransaction: {},
  };
  const input: ManifestData = {
    manifestVersion: '3.0',
    admin: deployment,
    impls: { a: deployment },
    proxies: [deployment],
  };
  const norm = normalizeManifestData(input);
  t.like(norm.admin, {
    ...deployment,
    kind: undefined,
    layout: undefined,
    deployTransaction: undefined,
  });
  t.like(norm.impls.a, {
    ...deployment,
    kind: undefined,
    deployTransaction: undefined,
  });
  t.like(norm.proxies[0], {
    ...deployment,
    layout: undefined,
    deployTransaction: undefined,
  });
});
