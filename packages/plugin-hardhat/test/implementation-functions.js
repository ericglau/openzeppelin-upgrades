const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2');
  t.context.GreeterProxiable = await ethers.getContractFactory('GreeterProxiable');
  t.context.GreeterV2Proxiable = await ethers.getContractFactory('GreeterV2Proxiable');
  t.context.Invalid = await ethers.getContractFactory('Invalid');
  t.context.GreeterStorageConflict = await ethers.getContractFactory('GreeterStorageConflict');
  t.context.GreeterStorageConflictProxiable = await ethers.getContractFactory('GreeterStorageConflictProxiable');
});

test('validate implementation - happy path', async t => {
  const { Greeter } = t.context;

  await upgrades.validateImplementation(Greeter);
});

test('validate implementation - invalid', async t => {
  const { Invalid } = t.context;

  await t.throwsAsync(
    () => upgrades.validateImplementation(Invalid),
    undefined,
    'Contract `Invalid` is not upgrade safe',
  );
});

test('validate upgrade beacon - happy path', async t => {
  const { Greeter, GreeterV2 } = t.context;

  const beacon = await upgrades.deployBeacon(Greeter);
  upgrades.validateUpgrade(beacon, GreeterV2);
});

test('validate upgrade beacon - incompatible storage', async t => {
  const { Greeter, GreeterStorageConflict } = t.context;

  const beacon = await upgrades.deployBeacon(Greeter);
  await t.throwsAsync(
    () => upgrades.validateUpgrade(beacon, GreeterStorageConflict),
    undefined,
    'New storage layout is incompatible due to the following changes',
  );
});

test('validate upgrade beacon - incompatible storage - forced', async t => {
  const { Greeter, GreeterStorageConflict } = t.context;

  const beacon = await upgrades.deployBeacon(Greeter);
  await upgrades.validateUpgrade(beacon, GreeterStorageConflict, { unsafeSkipStorageCheck: true });
});

test('validate upgrade transparent - happy path', async t => {
  const { Greeter, GreeterV2 } = t.context;

  const greeter = await upgrades.deployProxy(Greeter, ['Hola mundo!'], { kind: 'transparent' });
  upgrades.validateUpgrade(greeter, GreeterV2);
});

test('validate upgrade transparent - incompatible storage', async t => {
  const { Greeter, GreeterStorageConflict } = t.context;

  const greeter = await upgrades.deployProxy(Greeter, ['Hola mundo!'], { kind: 'transparent' });
  await t.throwsAsync(
    () => upgrades.validateUpgrade(greeter, GreeterStorageConflict),
    undefined,
    'New storage layout is incompatible due to the following changes',
  );
});

test('validate upgrade transparent - incompatible storage - forced', async t => {
  const { Greeter, GreeterStorageConflict } = t.context;

  const greeter = await upgrades.deployProxy(Greeter, ['Hola mundo!'], { kind: 'transparent' });
  await upgrades.validateUpgrade(greeter, GreeterStorageConflict, { unsafeSkipStorageCheck: true });
});

test('validate upgrade uups - happy path', async t => {
  const { GreeterProxiable, GreeterV2Proxiable } = t.context;

  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hola mundo!'], { kind: 'uups' });
  upgrades.validateUpgrade(greeter, GreeterV2Proxiable);
});

test('validate upgrade uups - incompatible storage', async t => {
  const { GreeterProxiable, GreeterStorageConflictProxiable } = t.context;

  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hola mundo!'], { kind: 'uups' });
  await t.throwsAsync(
    () => upgrades.validateUpgrade(greeter, GreeterStorageConflictProxiable),
    undefined,
    'New storage layout is incompatible due to the following changes',
  );
});

test('validate upgrade uups - incompatible storage - forced', async t => {
  const { GreeterProxiable, GreeterStorageConflictProxiable } = t.context;

  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hola mundo!'], { kind: 'uups' });
  await upgrades.validateUpgrade(greeter, GreeterStorageConflictProxiable, { unsafeSkipStorageCheck: true });
});

