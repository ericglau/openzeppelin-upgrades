const test = require('ava');

const { ethers, upgrades, network } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('GreeterProxiable');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2Proxiable');
});

const TIMED_OUT = 'Timed out waiting for transaction';
const USE_OPTIONS = 'If the problem persists, adjust the polling parameters with the timeout and pollingInterval options.';

test('timeouts', async t => {
  const { Greeter, GreeterV2 } = t.context;

  await network.provider.send("evm_setAutomine", [false]);
  await network.provider.send("evm_setIntervalMining", [1000]);

  // timeout too low, long polling
  let error = await t.throwsAsync(() => upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups', timeout: 1, pollingInterval: 2000 }));
  t.true(error.message.includes(TIMED_OUT) && error.message.includes(USE_OPTIONS));

  // timeout too low, short polling
  error = await t.throwsAsync(() => upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups', timeout: 1, pollingInterval: 1 }));
  t.true(error.message.includes(TIMED_OUT) && error.message.includes(USE_OPTIONS));

  // timeout too low, 0 ms polling
  error = await t.throwsAsync(() => upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups', timeout: 1, pollingInterval: 0 }));
  t.true(error.message.includes(TIMED_OUT) && error.message.includes(USE_OPTIONS));

  // good timeout, long polling
  await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups', timeout: 4000, pollingInterval: 2000 });

  // good timeout, short polling
  await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups', timeout: 4000, pollingInterval: 100 });
    
  // infinite timeout, long polling
  await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups', timeout: 0, pollingInterval: 2000 });

  // infinite timeout, short polling
  await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups', timeout: 0, pollingInterval: 100 });

  // infinite timeout, 0 ms polling
  await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups', timeout: 0, pollingInterval: 0 });

  // automine to immediately deploy a new proxy to use in below tests
  await network.provider.send("evm_setAutomine", [true]);
  const proxy = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups', timeout: 0, pollingInterval: 0 });
  await network.provider.send("evm_setAutomine", [false]);

  // upgrade: timeout too low
  error = await t.throwsAsync(() => upgrades.upgradeProxy(proxy, GreeterV2, { timeout: 1, pollingInterval: 1 }));
  t.true(error.message.includes(TIMED_OUT) && error.message.includes(USE_OPTIONS));

  // upgrade: infinite timeout, default polling
  await upgrades.upgradeProxy(proxy, GreeterV2, { timeout: 0 });

  await network.provider.send("evm_setAutomine", [true]);
});
