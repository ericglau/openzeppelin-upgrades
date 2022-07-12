const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2');
});

test('deployProxy with useDeployedImplementation - implementation not deployed', async t => {
  const { Greeter } = t.context;

  await t.throwsAsync(
    () => upgrades.deployProxy(Greeter, ['Hola mundo!'], { kind: 'transparent', useDeployedImplementation: true }),
    { message: /(The implementation contract was not previously deployed.)/ }
  );
});

test('deployBeacon with useDeployedImplementation - implementation not deployed', async t => {
  const { Greeter } = t.context;

  await t.throwsAsync(
    () => upgrades.deployBeacon(Greeter, { useDeployedImplementation: true }),
    { message: /(The implementation contract was not previously deployed.)/ }
  );
});

test('deployProxy with useDeployedImplementation - happy path', async t => {
  const { Greeter } = t.context;

  await upgrades.deployImplementation(Greeter);
  const greeter = await upgrades.deployProxy(Greeter, ['Hola mundo!'], { kind: 'transparent', useDeployedImplementation: true });
  t.is(await greeter.greet(), 'Hola mundo!');
});

test('deployBeacon with useDeployedImplementation - happy path', async t => {
  const { Greeter } = t.context;

  await upgrades.deployImplementation(Greeter);
  await upgrades.deployBeacon(Greeter, { useDeployedImplementation: true });
});
