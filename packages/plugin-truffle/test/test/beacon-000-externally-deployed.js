const assert = require('assert');

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
  it('block upgrade to unregistered beacon', async function () {
    // deploy beacon without upgrades plugin
    const greeter = await Greeter.deployed();
    const beacon = await Beacon.new(greeter.address);

    // upgrade beacon to new impl
    await assert.rejects(upgradeBeacon(beacon.address, GreeterV2), error =>
    error.message.includes(IS_NOT_REGISTERED),
    );
  });

  it('add proxy to unregistered beacon using contract implementation', async function () {
    // deploy beacon without upgrades plugin
    const greeter = await Greeter.deployed();
    const beacon = await Beacon.new(greeter.address);

    // upgrade beacon to new impl
    const greeterProxy = await deployBeaconProxy(beacon.address, ['Hello, proxy!'], {
      implementation: Greeter,
    });
    assert.equal(await greeterProxy.greet(), 'Hello, proxy!');
  });
});
