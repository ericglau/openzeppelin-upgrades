const assert = require('assert');
const { withDefaults } = require('@openzeppelin/truffle-upgrades/dist/utils/options.js');
const { getProxyFactory, getTransparentUpgradeableProxyFactory, getProxyAdminFactory, getBeaconProxyFactory, getUpgradeableBeaconFactory } = require('@openzeppelin/truffle-upgrades/dist/utils/factories.js');
const { getInitializerData } = require('@openzeppelin/truffle-upgrades/dist/utils/initializer-data');

const { importProxy, upgradeProxy, deployProxy, deployBeacon, deployBeaconProxy, upgradeBeacon, prepareUpgrade, erc1967 } = require('@openzeppelin/truffle-upgrades');

const { deployer } = withDefaults({});

const Greeter = artifacts.require('Greeter');
const GreeterV2 = artifacts.require('GreeterV2');
const GreeterV3 = artifacts.require('GreeterV3');
const GreeterProxiable = artifacts.require('GreeterProxiable');
const GreeterV2Proxiable = artifacts.require('GreeterV2Proxiable');
const GreeterV3Proxiable = artifacts.require('GreeterV3Proxiable');

const NOT_MATCH_BYTECODE = /Contract does not match with implementation bytecode deployed at \S+/;
const NOT_REGISTERED_ADMIN = "Proxy admin is not the one registered in the network manifest";

contract('Greeter', function () {
  it('import then deploy with same impl', async function () {
    const impl = await deployer.deploy(GreeterProxiable);
    const proxy = await deployer.deploy(getProxyFactory(), impl.address, getInitializerData(GreeterProxiable, ['Hello, Truffle!']));

    const greeter = await importProxy(proxy.address, GreeterProxiable);
    assert.equal(await greeter.greet(), 'Hello, Truffle!');
  
    const greeter2 = await deployProxy(GreeterProxiable, ['Hello, Truffle 2!']);
    assert.equal(await greeter2.greet(), 'Hello, Truffle 2!', );

    assert.equal(await erc1967.getImplementationAddress(greeter2.address), await erc1967.getImplementationAddress(greeter.address));
  });

  it('deploy then import with same impl', async function () {

    const greeter = await deployProxy(GreeterProxiable, ['Hello, Truffle!']);
  
    const impl = await deployer.deploy(GreeterProxiable);
    const proxy = await deployer.deploy(getProxyFactory(), impl.address, getInitializerData(GreeterProxiable, ['Hello, Truffle 2!']));

    const greeter2 = await importProxy(proxy.address, GreeterProxiable);
    assert.equal(await greeter2.greet(), 'Hello, Truffle 2!');
  
    const implAddr1 = await erc1967.getImplementationAddress(greeter.address);
    const implAddr2 = await erc1967.getImplementationAddress(greeter2.address);
    assert.notEqual(implAddr2, implAddr1);

    // upgrade imported proxy to the same impl
    await upgradeProxy(greeter2, GreeterProxiable);
    const implAddrUpgraded = await erc1967.getImplementationAddress(greeter2.address);
    assert.ok(implAddrUpgraded === implAddr1 || implAddrUpgraded === implAddr2, implAddrUpgraded);

    // upgrade imported proxy to different impl
    await upgradeProxy(greeter2, GreeterV2Proxiable);
    const implAddrUpgraded2 = await erc1967.getImplementationAddress(greeter2.address);
    assert.notEqual(implAddrUpgraded2, implAddrUpgraded);
  });

  // it('beacon happy path', async function () {
  //   const impl = await deployer.deploy(Greeter);
  //   const beacon = await deployer.deploy(getUpgradeableBeaconFactory(), impl.address);
  //   const proxy = await deployer.deploy(getBeaconProxyFactory(), beacon.address, getInitializerData(Greeter, ['Hello, Truffle!']));

  //   const greeter = await importProxy(proxy.address, Greeter);
  //   assert.equal(await greeter.greet(), 'Hello, Truffle!');

  //   await upgradeBeacon(beacon, GreeterV2);
  //   const greeter2 = await GreeterV2.at(greeter.address);
  //   assert.equal(await greeter2.greet(), 'Hello, Truffle!');
  //   await greeter2.resetGreeting();
  //   assert.equal(await greeter2.greet(), 'Hello World');
  // });

  // it('wrong implementation', async function () {
  //   const impl = await deployer.deploy(Greeter);
  //   const admin = await deployer.deploy(getProxyAdminFactory());
  //   const proxy = await deployer.deploy(getTransparentUpgradeableProxyFactory(), impl.address, admin.address, getInitializerData(Greeter, ['Hello, Truffle!']));

  //   await assert.rejects(importProxy(proxy.address, GreeterV2), error => NOT_MATCH_BYTECODE.test(error.message));
  // });

  // it('force implementation', async function () {
  //   const impl = await deployer.deploy(Greeter);
  //   const admin = await deployer.deploy(getProxyAdminFactory());
  //   const proxy = await deployer.deploy(getTransparentUpgradeableProxyFactory(), impl.address, admin.address, getInitializerData(Greeter, ['Hello, Truffle!']));

  //   const greeter = await importProxy(proxy.address, GreeterV2, { force: true });
  //   assert.equal(await greeter.greet(), 'Hello, Truffle!');

  //   // since this is the wrong impl, expect it to have an error if using a non-existent function
  //   await assert.rejects(greeter.resetGreeting(), error => error.message.includes("revert"));
  // });

  // it('multiple identical implementations', async function () {
  //   const impl = await deployer.deploy(GreeterProxiable);
  //   const proxy = await deployer.deploy(getProxyFactory(), impl.address, getInitializerData(Greeter, ['Hello, Truffle!']));

  //   const impl2 = await deployer.deploy(GreeterProxiable);
  //   const proxy2 = await deployer.deploy(getProxyFactory(), impl2.address, getInitializerData(Greeter, ['Hello, Truffle 2!']));

  //   const greeter = await importProxy(proxy.address, GreeterProxiable);
  //   const greeterUpgraded = await upgradeProxy(greeter, GreeterV2Proxiable);
  //   assert.equal(await greeterUpgraded.greet(), 'Hello, Truffle!');
  
  //   const greeter2 = await importProxy(proxy2.address, GreeterProxiable);
  //   const greeter2Upgraded = await upgradeProxy(greeter2, GreeterV2Proxiable);
  //   assert.equal(await greeter2Upgraded.greet(), 'Hello, Truffle 2!');
  // });

  // it('same implementations', async function () {
  //   const impl = await deployer.deploy(GreeterProxiable);
  //   const proxy = await deployer.deploy(getProxyFactory(), impl.address, getInitializerData(Greeter, ['Hello, Truffle!']));
  //   const proxy2 = await deployer.deploy(getProxyFactory(), impl.address, getInitializerData(Greeter, ['Hello, Truffle 2!']));

  //   const greeter = await importProxy(proxy.address, GreeterProxiable);
  //   const greeter2 = await importProxy(proxy2.address, GreeterProxiable);

  //   const implAddr1 = await erc1967.getImplementationAddress(greeter.address);
  //   const implAddr2 = await erc1967.getImplementationAddress(greeter2.address);
  //   assert.equal(implAddr2, implAddr1);
  // });

  // it('import transparents with different admin', async function () {
  //   const { deployer } = withDefaults({});

  //   const impl = await deployer.deploy(Greeter);
  //   const admin = await deployer.deploy(getProxyAdminFactory());
  //   const proxy = await deployer.deploy(getTransparentUpgradeableProxyFactory(), impl.address, admin.address, getInitializerData(Greeter, ['Hello, Truffle!']));

  //   const admin2 = await deployer.deploy(getProxyAdminFactory());
  //   const proxy2 = await deployer.deploy(getTransparentUpgradeableProxyFactory(), impl.address, admin2.address, getInitializerData(Greeter, ['Hello, Truffle!']));

  //   const greeter = await importProxy(proxy.address, Greeter);
  //   const greeter2 = await importProxy(proxy2.address, Greeter);

  //   assert.notEqual(await erc1967.getAdminAddress(greeter2.address), await erc1967.getAdminAddress(greeter.address));
  
  //   // cannot upgrade directly
  //   await assert.rejects(upgradeProxy(proxy.address, GreeterV2), error => NOT_REGISTERED_ADMIN === error.message);

  //   // prepare upgrades instead
  //   const greeterV2ImplAddr = await prepareUpgrade(greeter.address, GreeterV2);
  //   const greeterV2ImplAddr_2 = await prepareUpgrade(greeter2.address, GreeterV2);

  //   assert.equal(greeterV2ImplAddr_2, greeterV2ImplAddr);
  // });
});
