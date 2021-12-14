const assert = require('assert');

const { deployBeacon, deployBeaconProxy, upgradeBeacon, prepareUpgrade } = require('@openzeppelin/truffle-upgrades');

const Greeter = artifacts.require('Greeter');
const GreeterV2 = artifacts.require('GreeterV2');
const GreeterV3 = artifacts.require('GreeterV3');

contract('Greeter', function () {
  it('greeting', async function () {
    const greeter = await Greeter.deployed();
    assert.strictEqual(await greeter.greet(), 'Hello Truffle');
  });

  it('deployProxy', async function () {
    const greeterBeacon = await deployBeacon(Greeter);
    assert.ok(greeterBeacon.transactionHash, 'transaction hash is missing');

    const greeter = await deployBeaconProxy(greeterBeacon, ['Hello Truffle']);
    assert.ok(greeter.transactionHash, 'transaction hash is missing');

    await upgradeBeacon(greeterBeacon, GreeterV2);

    const greeter3ImplAddr = await prepareUpgrade(greeterBeacon.address, GreeterV3);
    const greeter3 = await GreeterV3.at(greeter3ImplAddr);
    const version3 = await greeter3.version();
    if (version3 !== 'V3') {
      throw new Error(`expected V3 but got ${version3}`);
    }
  });
});
