const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Example = await ethers.getContractFactory('Example');
  t.context.ExampleV2_Ok = await ethers.getContractFactory('ExampleV2_Ok');
  t.context.ExampleV2_Bad = await ethers.getContractFactory('ExampleV2_Bad');
});

test('validate namespace - ok', async t => {
  const { Example, ExampleV2_Ok } = t.context;

  await upgrades.validateUpgrade(Example, ExampleV2_Ok);
});

test('validate namespace - bad', async t => {
  const { Example, ExampleV2_Bad } = t.context;

  await upgrades.validateUpgrade(Example, ExampleV2_Bad);
});
