const test = require('ava');

const { ethers, upgrades } = require('hardhat');

const ProxyAdmin = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json');
const TransparentUpgradableProxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json');

const ERC1967Proxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2');
  t.context.GreeterProxiable = await ethers.getContractFactory('GreeterProxiable');
  t.context.GreeterV2Proxiable = await ethers.getContractFactory('GreeterV2Proxiable');

  t.context.ProxyAdmin = await ethers.getContractFactory(ProxyAdmin.abi, ProxyAdmin.bytecode);
  t.context.TransparentUpgradableProxy = await ethers.getContractFactory(
    TransparentUpgradableProxy.abi,
    TransparentUpgradableProxy.bytecode,
  );

  t.context.ERC1967Proxy = await ethers.getContractFactory(ERC1967Proxy.abi, ERC1967Proxy.bytecode);
});

function getInitializerData(contractInterface, args) {
  const initializer = 'initialize';
  const fragment = contractInterface.getFunction(initializer);
  return contractInterface.encodeFunctionData(fragment, args);
}

test('import then deploy with same impl', async t => {
  const { GreeterProxiable, ERC1967Proxy } = t.context;

  const impl = await GreeterProxiable.deploy();
  await impl.deployed();
  const proxy = await ERC1967Proxy.deploy(
    impl.address,
    getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat!']),
  );
  await proxy.deployed();

  const greeter = await upgrades.forceImport(proxy.address, GreeterProxiable);
  t.is(await greeter.greet(), 'Hello, Hardhat!');

  const greeter2 = await upgrades.deployProxy(GreeterProxiable, ['Hello, Hardhat 2!']);
  await greeter2.deployed();
  t.is(await greeter2.greet(), 'Hello, Hardhat 2!');

  t.is(
    await upgrades.erc1967.getImplementationAddress(greeter2.address),
    await upgrades.erc1967.getImplementationAddress(greeter.address),
  );
});

test('deploy then import with same impl', async t => {
  const { GreeterProxiable, GreeterV2Proxiable, ERC1967Proxy } = t.context;

  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hello, Hardhat!']);
  await greeter.deployed();

  const impl = await GreeterProxiable.deploy();
  await impl.deployed();
  const proxy = await ERC1967Proxy.deploy(
    impl.address,
    getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat 2!']),
  );
  await proxy.deployed();

  const greeter2 = await upgrades.forceImport(proxy.address, GreeterProxiable);
  t.is(await greeter2.greet(), 'Hello, Hardhat 2!');

  const implAddr1 = await upgrades.erc1967.getImplementationAddress(greeter.address);
  const implAddr2 = await upgrades.erc1967.getImplementationAddress(greeter2.address);
  t.not(implAddr2, implAddr1);

  // upgrade imported proxy to the same impl
  await upgrades.upgradeProxy(greeter2, GreeterProxiable);
  const implAddrUpgraded = await upgrades.erc1967.getImplementationAddress(greeter2.address);
  t.true(implAddrUpgraded === implAddr1 || implAddrUpgraded === implAddr2, implAddrUpgraded);

  // upgrade imported proxy to different impl
  await upgrades.upgradeProxy(greeter2, GreeterV2Proxiable);
  const implAddrUpgraded2 = await upgrades.erc1967.getImplementationAddress(greeter2.address);
  t.not(implAddrUpgraded2 !== implAddrUpgraded, implAddrUpgraded2);
});

test('import previous deployment', async t => {
  const { GreeterProxiable } = t.context;

  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hello, Hardhat!']);
  await greeter.deployed();

  const greeterImported = await upgrades.forceImport(greeter.address, GreeterProxiable);
  t.is(await greeterImported.greet(), 'Hello, Hardhat!');

  t.is(greeterImported.address, greeter.address);
  t.is(
    await upgrades.erc1967.getImplementationAddress(greeterImported.address),
    await upgrades.erc1967.getImplementationAddress(greeter.address),
  );
});

test('import previous import', async t => {
  const { GreeterProxiable, ERC1967Proxy } = t.context;

  const impl = await GreeterProxiable.deploy();
  await impl.deployed();
  const proxy = await ERC1967Proxy.deploy(
    impl.address,
    getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat!']),
  );
  await proxy.deployed();

  const greeterImported = await upgrades.forceImport(proxy.address, GreeterProxiable);
  const greeterImportedAgain = await upgrades.forceImport(proxy.address, GreeterProxiable);

  t.is(greeterImportedAgain.address, greeterImported.address);
  t.is(
    await upgrades.erc1967.getImplementationAddress(greeterImportedAgain.address),
    await upgrades.erc1967.getImplementationAddress(greeterImported.address),
  );
});

test('import then deploy transparent with same admin', async t => {
  const { Greeter, GreeterV2, ProxyAdmin, TransparentUpgradableProxy } = t.context;

  const impl = await Greeter.deploy();
  await impl.deployed();
  const admin = await ProxyAdmin.deploy();
  await admin.deployed();
  const proxy = await TransparentUpgradableProxy.deploy(
    impl.address,
    admin.address,
    getInitializerData(Greeter.interface, ['Hello, Hardhat!']),
  );
  await proxy.deployed();

  const greeter = await upgrades.forceImport(proxy.address, Greeter);
  const greeter2 = await upgrades.deployProxy(Greeter, ['Hello, Hardhat 2!']);
  await greeter2.deployed();

  t.is(
    await upgrades.erc1967.getAdminAddress(greeter2.address),
    await upgrades.erc1967.getAdminAddress(greeter.address),
  );

  const upgraded = await upgrades.upgradeProxy(greeter.address, GreeterV2);
  await upgraded.deployed();
  const upgraded2 = await upgrades.upgradeProxy(greeter2.address, GreeterV2);
  await upgraded2.deployed();
});

test('change proxy to use same impl at different address', async t => {
  const { GreeterProxiable, GreeterV2Proxiable } = t.context;

  // deploy proxy using plugin
  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hello, Hardhat!']);
  await greeter.deployed();
  const implAddr1 = await upgrades.erc1967.getImplementationAddress(greeter.address);

  // manually deploy same impl to second address
  const impl2 = await GreeterProxiable.deploy();
  await impl2.deployed();

  // manually upgrade proxy to use second impl address
  const proxy = GreeterProxiable.attach(greeter.address);
  await proxy.upgradeTo(impl2.address);
  const reimportedGreeter = await upgrades.forceImport(greeter.address, GreeterProxiable);

  t.is(reimportedGreeter.address, greeter.address);

  const implAddr2 = await upgrades.erc1967.getImplementationAddress(reimportedGreeter.address);
  t.not(implAddr2, implAddr1);
  t.is(implAddr2, impl2.address);

  // upgrade re-imported proxy to different impl
  const upgraded = await upgrades.upgradeProxy(reimportedGreeter, GreeterV2Proxiable);
  const implAddrUpgraded2 = await upgrades.erc1967.getImplementationAddress(reimportedGreeter.address);
  t.not(implAddrUpgraded2, implAddr2);

  // run a function on new impl to ensure the upgrade worked
  await upgraded.resetGreeting();
  t.is(await upgraded.greet(), 'Hello World');
});