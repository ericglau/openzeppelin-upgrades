const assert = require('assert');

const { withDefaults } = require('@openzeppelin/truffle-upgrades/dist/utils/options.js');

const {
  deployBeacon,
  deployBeaconProxy,
  upgradeBeacon,
  loadProxy,
  prepareUpgrade,
} = require('@openzeppelin/truffle-upgrades');

const Greeter = artifacts.require('Greeter');
const GreeterV2 = artifacts.require('GreeterV2');
const Beacon = artifacts.require('Beacon');

const TX_HASH_MISSING = 'transaction hash is missing';

const IS_NOT_REGISTERED = 'is not registered';
const BEACON_IMPL_UNKNOWN_REGEX = /Beacon's current implementation at \S+ is unknown/;

// These tests need to run before the other deploy beacon tests so that the beacon implementation will not already be in the manifest.

contract('Greeter', function () {
  const { deployer } = withDefaults({});

  it('block upgrade to unregistered beacon', async function () {
    const greeter = await Greeter.deployed();
//    await deployer.deploy(Beacon, greeter.address);
    const beacon = await Beacon.new(greeter.address);

    // upgrade beacon to new impl
    await assert.rejects(upgradeBeacon(beacon.address, GreeterV2), error =>
    error.message.includes(IS_NOT_REGISTERED),
    );
  });
});
