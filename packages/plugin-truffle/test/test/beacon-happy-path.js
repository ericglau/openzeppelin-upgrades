const assert = require('assert');

const { deployBeacon, deployBeaconProxy, upgradeBeacon, loadProxy, prepareUpgrade } = require('@openzeppelin/truffle-upgrades');

const Greeter = artifacts.require('Greeter');
const GreeterV2 = artifacts.require('GreeterV2');
const GreeterV3 = artifacts.require('GreeterV3');

const TX_HASH_MISSING = 'transaction hash is missing';

contract('Greeter', function () {
  it('greeting', async function () {
    const greeter = await Greeter.deployed();
    assert.strictEqual(await greeter.greet(), 'Hello Truffle');
  });

  it('deployProxy', async function () {
/* 
    const greeterBeacon = await deployBeacon(Greeter);
    const greeter = await deployBeaconProxy(greeterBeacon, ['Hello, Hardhat!']);
    assert.ok(greeterBeacon.transactionHash, TX_HASH_MISSING);
    assert.ok(greeter.transactionHash, TX_HASH_MISSING);
    assert.equal(await greeter.greet(), 'Hello, Hardhat!');
  
    const greeterSecond = await deployBeaconProxy(greeterBeacon, ['Hello, Hardhat second!']);
    assert.ok(greeterSecond.transactionHash, TX_HASH_MISSING);
    assert.equal(await greeterSecond.greet(), 'Hello, Hardhat second!');
  
    // new impl
    await upgradeBeacon(greeterBeacon, GreeterV2);
  
    // reload proxy to work with the new contract
    const greeter2 = await loadProxy(greeter);
    assert.equal(await greeter2.greet(), 'Hello, Hardhat!');
    await greeter2.resetGreeting();
    assert.equal(await greeter2.greet(), 'Hello World');
  
    // reload proxy to work with the new contract
    const greeterSecond2 = await loadProxy(greeterSecond);
    assert.equal(await greeterSecond2.greet(), 'Hello, Hardhat second!');
    await greeterSecond2.resetGreeting();
    assert.equal(await greeterSecond2.greet(), 'Hello World');
  
    // prepare upgrade from beacon proxy
    const greeter3ImplAddr = await prepareUpgrade(greeter.address, GreeterV3);
    const greeter3 = GreeterV3.attach(greeter3ImplAddr);
    const version3 = await greeter3.version();
    assert.equal(version3, 'V3');
  
    // prepare upgrade from beacon itself
    const greeter3ImplAddrFromBeacon = await prepareUpgrade(greeterBeacon.address, GreeterV3);
    const greeter3FromBeacon = GreeterV3.attach(greeter3ImplAddrFromBeacon);
    const version3FromBeacon = await greeter3FromBeacon.version();
    assert.equal(version3FromBeacon, 'V3'); */



    const greeterBeacon = await deployBeacon(Greeter);
    assert.ok(greeterBeacon.transactionHash, 'transaction hash is missing');

    const greeter = await deployBeaconProxy(greeterBeacon, ['Hello Truffle']);
    assert.ok(greeter.transactionHash, 'transaction hash is missing');
    if (await greeter.greet() !== 'Hello Truffle') {
      throw new Error(`expected Hello Truffle but got ${await greeter.greet()}`);
    }

    const greeterSecond = await deployBeaconProxy(greeterBeacon, ['Hello Truffle second']);
    assert.ok(greeterSecond.transactionHash, 'transaction hash is missing');
    if (await greeterSecond.greet() !== 'Hello Truffle second') {
      throw new Error(`expected Hello Truffle second but got ${await greeterSecond.greet()}`);
    }

    //  new impl
    await upgradeBeacon(greeterBeacon, GreeterV2);
    if (await greeter.greet() !== 'Hello Truffle') {
      throw new Error(`expected Hello Truffle but got ${await greeter.greet()}`);
    }

    // reload proxy to work with the new contract
    const greeter2 = await GreeterV2.at(greeter.address);//await loadProxy(greeter);
    if (await greeter2.greet() !== 'Hello Truffle') {
      throw new Error(`expected Hello Truffle but got ${await greeter.greet()}`);
    }

    await greeter2.resetGreeting();
    if (await greeter2.greet() !== 'Hello World') {
      throw new Error(`expected Hello World but got ${await greeter2.greet()}`);
    }

    // prepare upgrade from beacon proxy
    const greeter3ImplAddr = await prepareUpgrade(greeterBeacon.address, GreeterV3);
    const greeter3 = await GreeterV3.at(greeter3ImplAddr);
    const version3 = await greeter3.version();
    if (version3 !== 'V3') {
      throw new Error(`expected V3 but got ${version3}`);
    }
  });
});
