const test = require('ava');

const { ethers, upgrades } = require('hardhat');

upgrades.silenceWarnings();

test.before(async t => {
  t.context.Action = await ethers.getContractFactory('Action');
  t.context.ActionV2 = await ethers.getContractFactory('ActionV2');
  t.context.ActionV2Bad = await ethers.getContractFactory('ActionV2Bad');
});

test('deployProxy', async t => {
  const { Action } = t.context;
  await upgrades.deployProxy(Action, [], { kind: 'beacon' });
});

test('upgradeProxy', async t => {
  const { Action, ActionV2 } = t.context;
  const action = await upgrades.deployProxy(Action, [], { kind: 'beacon' });
  await upgrades.upgradeProxy(action, ActionV2, { kind: 'beacon' });
});

test('upgradeProxy with incompatible layout', async t => {
  const { Action, ActionV2Bad } = t.context;
  const action = await upgrades.deployProxy(Action, [], { kind: 'beacon' });
  const error = await t.throwsAsync(() => upgrades.upgradeProxy(action, ActionV2Bad, { kind: 'beacon' }));
  t.true(error.message.includes('Upgraded `action` to an incompatible type'));
});
