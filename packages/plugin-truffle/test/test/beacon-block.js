const assert = require('assert');
const { withDefaults } = require('@openzeppelin/truffle-upgrades/dist/utils/options.js');
const { deployProxy, upgradeProxy, prepareUpgrade } = require('@openzeppelin/truffle-upgrades');

const Greeter = artifacts.require('Greeter');
const GreeterV2 = artifacts.require('GreeterV2');
const GreeterV3 = artifacts.require('GreeterV3');
const Beacon = artifacts.require('Beacon');

const DOESNT_LOOK_LIKE_PROXY = "doesn't look like an administered ERC 1967 proxy";

contract('Greeter', function () {
  it('Block deployProxy with beacon kind', async function () {
    // TODO remove this test when beacon proxy support is implemented
    await assert.rejects(deployProxy(Greeter, ['Hello Truffle'], { kind: 'beacon' }), error =>
      error.message.includes('Beacon proxy is not currently supported with Truffle Upgrades.'),
    );
  });

  it('Block upgradeProxy with externally deployed beacon proxy', async function () {

    const { deployer } = withDefaults({});

    // deploy implementation contract without upgrades plugin
    const greeter = await deployer.deploy(Greeter);
    greeter.initialize('Hello, Hardhat!');
    assert.ok(greeter.transactionHash, 'transaction hash is missing');

    // deploy beacon without upgrades plugin
    const beacon = await deployer.deploy(Beacon, greeter.address);
    assert.ok(beacon.transactionHash, 'transaction hash is missing');

    await assert.rejects(upgradeProxy(greeter, GreeterV2, ['Hello Truffle']), error =>
      error.message.includes(DOESNT_LOOK_LIKE_PROXY),
    );
  });
});
