const assert = require('assert');
const { withDefaults } = require('@openzeppelin/truffle-upgrades/dist/utils/options.js');
const { getProxyFactory, getTransparentUpgradeableProxyFactory, getProxyAdminFactory, getBeaconProxyFactory, getUpgradeableBeaconFactory } = require('@openzeppelin/truffle-upgrades/dist/utils/factories.js');
const { getInitializerData } = require('@openzeppelin/truffle-upgrades/dist/utils/initializer-data');

const { importProxy, upgradeProxy, deployBeacon, deployBeaconProxy, upgradeBeacon, prepareUpgrade } = require('@openzeppelin/truffle-upgrades');


const Greeter = artifacts.require('Greeter');
const GreeterV2 = artifacts.require('GreeterV2');
const GreeterV3 = artifacts.require('GreeterV3');
const GreeterProxiable = artifacts.require('GreeterProxiable');
const GreeterV2Proxiable = artifacts.require('GreeterV2Proxiable');
const GreeterV3Proxiable = artifacts.require('GreeterV3Proxiable');

const NOT_MATCH_BYTECODE = /Contract does not match with implementation bytecode deployed at \S+/;
const NOT_REGISTERED_ADMIN = "Proxy admin is not the one registered in the network manifest";

contract('Greeter', function () {
  it('transparent happy path', async function () {
    const { deployer } = withDefaults({});

    const impl = await deployer.deploy(Greeter);
    const admin = await deployer.deploy(getProxyAdminFactory());
    const proxy = await deployer.deploy(getTransparentUpgradeableProxyFactory(), impl.address, admin.address, getInitializerData(Greeter, ['Hello, Truffle!']));

    const greeter = await importProxy(proxy.address, Greeter);
    assert.equal(await greeter.greet(), 'Hello, Truffle!');
  
    // TODO can't upgrade because different admin
    // const greeter2 = await upgradeProxy(greeter, GreeterV2);
    // assert.equal(await greeter2.greet(), 'Hello, Truffle!');
    // await greeter2.resetGreeting();
    // assert.equal(await greeter2.greet(), 'Hello World');
  });

  it('uups happy path', async function () {
    const { deployer } = withDefaults({});

    const impl = await deployer.deploy(GreeterProxiable);
    const proxy = await deployer.deploy(getProxyFactory(), impl.address, getInitializerData(Greeter, ['Hello, Truffle!']));

    const greeter = await importProxy(proxy.address, GreeterProxiable);
    assert.equal(await greeter.greet(), 'Hello, Truffle!');
  
    const greeter2 = await upgradeProxy(greeter, GreeterV2Proxiable);
    assert.equal(await greeter2.greet(), 'Hello, Truffle!');
    await greeter2.resetGreeting();
    assert.equal(await greeter2.greet(), 'Hello World');
  });

  it('beacon happy path', async function () {
    const { deployer } = withDefaults({});

    const impl = await deployer.deploy(Greeter);
    const beacon = await deployer.deploy(getUpgradeableBeaconFactory(), impl.address);
    const proxy = await deployer.deploy(getBeaconProxyFactory(), beacon.address, getInitializerData(Greeter, ['Hello, Truffle!']));

    const greeter = await importProxy(proxy.address, Greeter);
    assert.equal(await greeter.greet(), 'Hello, Truffle!');

    await upgradeBeacon(beacon, GreeterV2);
    const greeter2 = await GreeterV2.at(greeter.address);
    assert.equal(await greeter2.greet(), 'Hello, Truffle!');
    await greeter2.resetGreeting();
    assert.equal(await greeter2.greet(), 'Hello World');
  });

  // it('deployBeaconProxy', async function () {
  //   const greeterBeacon = await deployBeacon(GreeterBeaconImpl);
  //   assert.ok(greeterBeacon.transactionHash, TX_HASH_MISSING);
  //   const greeter = await deployBeaconProxy(greeterBeacon, GreeterBeaconImpl, ['Hello Truffle']);
  //   assert.ok(greeter.transactionHash, TX_HASH_MISSING);
  //   assert.notEqual(greeter.transactionHash, greeterBeacon.transactionHash);
  //   assert.equal(await greeter.greet(), 'Hello Truffle');

  //   const greeterSecond = await deployBeaconProxy(greeterBeacon, GreeterBeaconImpl, ['Hello Truffle second']);
  //   assert.ok(greeterSecond.transactionHash, TX_HASH_MISSING);
  //   assert.notEqual(greeterSecond.transactionHash, greeter.transactionHash);
  //   assert.equal(await greeterSecond.greet(), 'Hello Truffle second');

  //   //  new impl
  //   const upgradedBeacon = await upgradeBeacon(greeterBeacon, GreeterV2);
  //   assert.ok(upgradedBeacon.transactionHash, TX_HASH_MISSING);
  //   assert.notEqual(upgradedBeacon.transactionHash, greeterBeacon.transactionHash);

  //   // reload proxy to work with the new contract
  //   const greeter2 = await GreeterV2.at(greeter.address);
  //   assert.equal(await greeter2.greet(), 'Hello Truffle');
  //   await greeter2.resetGreeting();
  //   assert.equal(await greeter2.greet(), 'Hello World');

  //   // reload proxy to work with the new contract
  //   const greeterSecond2 = await GreeterV2.at(greeterSecond.address);
  //   assert.equal(await greeterSecond2.greet(), 'Hello Truffle second');
  //   await greeterSecond2.resetGreeting();
  //   assert.equal(await greeterSecond2.greet(), 'Hello World');

  //   // prepare upgrade from beacon proxy
  //   const greeter3ImplAddr = await prepareUpgrade(greeter.address, GreeterV3);
  //   const greeter3 = await GreeterV3.at(greeter3ImplAddr);
  //   const version3 = await greeter3.version();
  //   assert.equal(version3, 'V3');

  //   // prepare upgrade from beacon itself
  //   const greeter3ImplAddrFromBeacon = await prepareUpgrade(greeterBeacon.address, GreeterV3);
  //   const greeter3FromBeacon = await GreeterV3.at(greeter3ImplAddrFromBeacon);
  //   const version3FromBeacon = await greeter3FromBeacon.version();
  //   assert.equal(version3FromBeacon, 'V3');
  // });
});
