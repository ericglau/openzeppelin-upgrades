const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Example = await ethers.getContractFactory('Example');
  t.context.ExampleV2_Ok = await ethers.getContractFactory('ExampleV2_Ok');
  t.context.ExampleV2_Bad = await ethers.getContractFactory('ExampleV2_Bad');
  t.context.RecursiveStruct = await ethers.getContractFactory('RecursiveStruct');
  t.context.RecursiveStructV2_Ok = await ethers.getContractFactory('RecursiveStructV2_Ok');
  t.context.RecursiveStructV2_Bad = await ethers.getContractFactory('RecursiveStructV2_Bad');
});

test('validate namespace - ok', async t => {
  const { Example, ExampleV2_Ok } = t.context;

  await upgrades.validateUpgrade(Example, ExampleV2_Ok);
});

test('validate namespace - bad', async t => {
  const { Example, ExampleV2_Bad } = t.context;

  try {
    await upgrades.validateUpgrade(Example, ExampleV2_Bad);
  } catch (e) {
    const comparison = e.report.ops;

    // Ensure the layout change is detected, in addition to the deletion. This is not normally reported since it has lower cost.
    t.like(comparison, {
      length: 2,
      0: {
        kind: 'delete',
        original: {
          contract: 'Example',
          label: 'x',
          type: {
            id: 't_uint256',
          },
        },
      },
      1: {
        kind: 'layoutchange',
        original: {
          label: 'y',
          type: {
            id: 't_uint256',
          },
          slot: '1',
        },
        updated: {
          label: 'y',
          type: {
            id: 't_uint256',
          },
          slot: '0',
        },
      },
    });
  }
});

test('validate namespace - recursive - ok', async t => {
  const { RecursiveStruct, RecursiveStructV2_Ok } = t.context;

  await upgrades.validateUpgrade(RecursiveStruct, RecursiveStructV2_Ok);
});

test('validate namespace - recursive - bad', async t => {
  const { RecursiveStruct, RecursiveStructV2_Bad } = t.context;

  try {
    await upgrades.validateUpgrade(RecursiveStruct, RecursiveStructV2_Bad);
  } catch (e) {
    const comparison = e.report.ops;

    t.like(comparison, {
      length: 1,
      0: {
        kind: 'layoutchange',
        original: {
          label: 'y',
          slot: '2',
        },
        updated: {
          label: 'y',
          slot: '3',
        },
      },
    });
  }
});
