const test = require('ava');

const { ethers, upgrades } = require('hardhat');

const ProxyAdmin = require('../artifacts/@openzeppelin/contracts-5.0/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json');
const TransparentUpgradableProxy = require('../artifacts/@openzeppelin/contracts-5.0/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json');

const ERC1967Proxy = require('../artifacts/@openzeppelin/contracts-5.0/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json');

const BeaconProxy = require('../artifacts/@openzeppelin/contracts-5.0/proxy/beacon/BeaconProxy.sol/BeaconProxy.json');
const UpgradableBeacon = require('../artifacts/@openzeppelin/contracts-5.0/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2');
  t.context.GreeterV3 = await ethers.getContractFactory('GreeterV3');
  t.context.GreeterProxiable = await ethers.getContractFactory('Greeter50Proxiable');
  t.context.GreeterV2Proxiable = await ethers.getContractFactory('Greeter50V2Proxiable');
  t.context.GreeterV3Proxiable = await ethers.getContractFactory('GreeterV3Proxiable');
  t.context.CustomProxy = await ethers.getContractFactory('CustomProxy');
  t.context.CustomProxyWithAdmin = await ethers.getContractFactory('CustomProxyWithAdmin');

  t.context.ProxyAdmin = await ethers.getContractFactory(ProxyAdmin.abi, ProxyAdmin.bytecode);
  t.context.TransparentUpgradableProxy = await ethers.getContractFactory(
    TransparentUpgradableProxy.abi,
    TransparentUpgradableProxy.bytecode,
  );

  t.context.ERC1967Proxy = await ethers.getContractFactory(ERC1967Proxy.abi, ERC1967Proxy.bytecode);

  t.context.BeaconProxy = await ethers.getContractFactory(BeaconProxy.abi, BeaconProxy.bytecode);
  t.context.UpgradableBeacon = await ethers.getContractFactory(UpgradableBeacon.abi, UpgradableBeacon.bytecode);
});

function getInitializerData(contractInterface, args) {
  const initializer = 'initialize';
  const fragment = contractInterface.getFunction(initializer);
  return contractInterface.encodeFunctionData(fragment, args);
}

const REQUESTED_UPGRADE_WRONG_KIND = 'Requested an upgrade of kind uups but proxy is transparent';

test('implementation happy path', async t => {
  const { GreeterProxiable } = t.context;

  const impl = await GreeterProxiable.deploy();
  await impl.deployed();

  const contract = await upgrades.forceImport(impl.address, GreeterProxiable);
  t.is(impl.address, contract.address);
  t.is('', await contract.greet());

  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hello, Hardhat!'], {
    useDeployedImplementation: true,
  });
  t.is(await greeter.greet(), 'Hello, Hardhat!');
});

test('no contract', async t => {
  const { GreeterProxiable } = t.context;

  const e = await t.throwsAsync(() =>
    upgrades.forceImport('0x0000000000000000000000000000000000000001', GreeterProxiable),
  );
  t.true(e.message.startsWith('No contract at address 0x0000000000000000000000000000000000000001'), e.message);
});

test('transparent happy path', async t => {
  const { Greeter, GreeterV2, ProxyAdmin, TransparentUpgradableProxy } = t.context;

  const owner = (await ethers.getSigners())[0].address;

  const impl = await Greeter.deploy();
  await impl.deployed();
  const admin = await ProxyAdmin.deploy(owner);
  // await admin.deployed();
  // const proxy = await TransparentUpgradableProxy.deploy(
  //   impl.address,
  //   owner,
  //   getInitializerData(Greeter.interface, ['Hello, Hardhat!']),
  // );
  // await proxy.deployed();

  // const greeter = await upgrades.forceImport(proxy.address, Greeter);
  // t.is(await greeter.greet(), 'Hello, Hardhat!');

  // const greeter2 = await upgrades.upgradeProxy(greeter, GreeterV2);
  // await greeter2.deployed();
  // t.is(await greeter2.greet(), 'Hello, Hardhat!');
  // await greeter2.resetGreeting();
  // t.is(await greeter2.greet(), 'Hello World');
});

// test('uups happy path', async t => {
//   const { GreeterProxiable, GreeterV2Proxiable, ERC1967Proxy } = t.context;

//   const impl = await GreeterProxiable.deploy();
//   await impl.deployed();
//   const proxy = await ERC1967Proxy.deploy(
//     impl.address,
//     getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();

//   const greeter = await upgrades.forceImport(proxy.address, GreeterProxiable);
//   t.is(await greeter.greet(), 'Hello, Hardhat!');

//   const greeter2 = await upgrades.upgradeProxy(greeter, GreeterV2Proxiable);
//   await greeter2.deployed();
//   t.is(await greeter2.greet(), 'Hello, Hardhat!');
//   await greeter2.resetGreeting();
//   t.is(await greeter2.greet(), 'Hello World');
// });

// test('beacon proxy happy path', async t => {
//   const { Greeter, GreeterV2, UpgradableBeacon, BeaconProxy } = t.context;

//   const owner = (await ethers.getSigners())[0];

//   const impl = await Greeter.deploy();
//   await impl.deployed();
//   const beacon = await UpgradableBeacon.deploy(impl.address, owner);
//   await beacon.deployed();
//   const proxy = await BeaconProxy.deploy(
//     beacon.address,
//     getInitializerData(Greeter.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();

//   const greeter = await upgrades.forceImport(proxy.address, Greeter);
//   t.is(await greeter.greet(), 'Hello, Hardhat!');

//   await upgrades.upgradeBeacon(beacon, GreeterV2);
//   const greeter2 = GreeterV2.attach(greeter.address);
//   await greeter2.deployed();
//   t.is(await greeter2.greet(), 'Hello, Hardhat!');
//   await greeter2.resetGreeting();
//   t.is(await greeter2.greet(), 'Hello World');
// });

// test('beacon happy path', async t => {
//   const { Greeter, GreeterV2, UpgradableBeacon } = t.context;

//   const owner = (await ethers.getSigners())[0];

//   const impl = await Greeter.deploy();
//   await impl.deployed();
//   const beacon = await UpgradableBeacon.deploy(impl.address, owner);
//   await beacon.deployed();

//   const beaconImported = await upgrades.forceImport(beacon.address, Greeter);
//   t.is(await beaconImported.implementation(), impl.address);

//   await upgrades.upgradeBeacon(beacon, GreeterV2);
// });

// test('import proxy using contract instance', async t => {
//   const { GreeterProxiable, GreeterV2Proxiable, ERC1967Proxy } = t.context;

//   const impl = await GreeterProxiable.deploy();
//   await impl.deployed();
//   const proxy = await ERC1967Proxy.deploy(
//     impl.address,
//     getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();

//   const greeter = await upgrades.forceImport(proxy, GreeterProxiable);
//   t.is(await greeter.greet(), 'Hello, Hardhat!');

//   const greeter2 = await upgrades.upgradeProxy(greeter, GreeterV2Proxiable);
//   await greeter2.deployed();
//   t.is(await greeter2.greet(), 'Hello, Hardhat!');
//   await greeter2.resetGreeting();
//   t.is(await greeter2.greet(), 'Hello World');
// });

// test('wrong kind', async t => {
//   const { GreeterProxiable, GreeterV2Proxiable, ERC1967Proxy } = t.context;

//   const impl = await GreeterProxiable.deploy();
//   await impl.deployed();
//   const proxy = await ERC1967Proxy.deploy(
//     impl.address,
//     getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();

//   // specify wrong kind
//   const greeter = await upgrades.forceImport(proxy.address, GreeterProxiable, { kind: 'transparent' });
//   t.is(await greeter.greet(), 'Hello, Hardhat!');

//   // an error is expected since the user force imported the wrong kind
//   const e = await t.throwsAsync(() => upgrades.upgradeProxy(greeter, GreeterV2Proxiable));
//   t.true(e.message.startsWith(REQUESTED_UPGRADE_WRONG_KIND), e.message);
// });

// test('import custom UUPS proxy', async t => {
//   const { GreeterProxiable, GreeterV2Proxiable, CustomProxy } = t.context;

//   const impl = await GreeterProxiable.deploy();
//   await impl.deployed();
//   const proxy = await CustomProxy.deploy(
//     impl.address,
//     getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();

//   const greeter = await upgrades.forceImport(proxy.address, GreeterProxiable);
//   t.is(await greeter.greet(), 'Hello, Hardhat!');

//   await upgrades.upgradeProxy(greeter, GreeterV2Proxiable);
// });

// test('import custom UUPS proxy with admin', async t => {
//   const { GreeterProxiable, GreeterV2Proxiable, CustomProxyWithAdmin } = t.context;

//   const impl = await GreeterProxiable.deploy();
//   await impl.deployed();
//   const proxy = await CustomProxyWithAdmin.deploy(
//     impl.address,
//     getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();

//   const greeter = await upgrades.forceImport(proxy.address, GreeterProxiable);
//   t.is(await greeter.greet(), 'Hello, Hardhat!');

//   await upgrades.upgradeProxy(greeter, GreeterV2Proxiable);
// });

// test('wrong implementation', async t => {
//   const { Greeter, GreeterV2, ProxyAdmin, TransparentUpgradableProxy } = t.context;

//   const owner = (await ethers.getSigners())[0];

//   const impl = await Greeter.deploy();
//   await impl.deployed();
//   const admin = await ProxyAdmin.deploy(owner);
//   await admin.deployed();
//   const proxy = await TransparentUpgradableProxy.deploy(
//     impl.address,
//     owner,
//     getInitializerData(Greeter.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();

//   const greeter = await upgrades.forceImport(proxy.address, GreeterV2);
//   t.is(await greeter.greet(), 'Hello, Hardhat!');

//   // since this is the wrong impl, expect it to have an error if using a non-existent function
//   const e = await t.throwsAsync(() => greeter.resetGreeting());
//   t.true(e.message.includes('Transaction reverted'), e.message);
// });

// test('multiple identical implementations', async t => {
//   const { GreeterProxiable, GreeterV2Proxiable, ERC1967Proxy } = t.context;

//   const impl = await GreeterProxiable.deploy();
//   await impl.deployed();
//   const proxy = await ERC1967Proxy.deploy(
//     impl.address,
//     getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();

//   const impl2 = await GreeterProxiable.deploy();
//   await impl2.deployed();
//   const proxy2 = await ERC1967Proxy.deploy(
//     await impl2.address,
//     getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat 2!']),
//   );
//   await proxy2.deployed();

//   const greeter = await upgrades.forceImport(proxy.address, GreeterProxiable);
//   const greeterUpgraded = await upgrades.upgradeProxy(greeter, GreeterV2Proxiable);
//   t.is(await greeterUpgraded.greet(), 'Hello, Hardhat!');

//   const greeter2 = await upgrades.forceImport(await proxy2.address, GreeterProxiable);
//   const greeter2Upgraded = await upgrades.upgradeProxy(greeter2, GreeterV2Proxiable);
//   t.is(await greeter2Upgraded.greet(), 'Hello, Hardhat 2!');
// });

// test('same implementation', async t => {
//   const { GreeterProxiable, ERC1967Proxy } = t.context;

//   const impl = await GreeterProxiable.deploy();
//   await impl.deployed();
//   const proxy = await ERC1967Proxy.deploy(
//     impl.address,
//     getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();
//   const proxy2 = await ERC1967Proxy.deploy(
//     impl.address,
//     getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat 2!']),
//   );
//   await proxy2.deployed();

//   const greeter = await upgrades.forceImport(proxy.address, GreeterProxiable);
//   const greeter2 = await upgrades.forceImport(await proxy2.address, GreeterProxiable);

//   const implAddr1 = await upgrades.erc1967.getImplementationAddress(greeter.address);
//   const implAddr2 = await upgrades.erc1967.getImplementationAddress(await greeter2.address);
//   t.is(implAddr2, implAddr1);
// });

// test('import transparents with different admin', async t => {
//   const { Greeter, GreeterV2, ProxyAdmin, TransparentUpgradableProxy } = t.context;

//   const owner = (await ethers.getSigners())[0];

//   const impl = await Greeter.deploy();
//   await impl.deployed();
//   const admin = await ProxyAdmin.deploy(owner);
//   await admin.deployed();
//   const proxy = await TransparentUpgradableProxy.deploy(
//     impl.address,
//     owner,
//     getInitializerData(Greeter.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();

//   const owner2 = (await ethers.getSigners())[1];

//   const admin2 = await ProxyAdmin.deploy(owner2);
//   await admin2.deployed();
//   const proxy2 = await TransparentUpgradableProxy.deploy(
//     impl.address,
//     owner2,
//     getInitializerData(Greeter.interface, ['Hello, Hardhat 2!']),
//   );
//   await proxy2.deployed();

//   const greeter = await upgrades.forceImport(proxy.address, Greeter);
//   const greeter2 = await upgrades.forceImport(await proxy2.address, Greeter);

//   t.not(
//     await upgrades.erc1967.getAdminAddress(await greeter2.address),
//     await upgrades.erc1967.getAdminAddress(greeter.address),
//   );

//   // proxy with a different admin can be imported
//   const proxyAddress = proxy.address;
//   await upgrades.upgradeProxy(proxyAddress, GreeterV2);
// });

// test('import transparent then upgrade with call', async t => {
//   const { Greeter, GreeterV2, ProxyAdmin, TransparentUpgradableProxy } = t.context;

//   const owner = (await ethers.getSigners())[0];

//   const impl = await Greeter.deploy();
//   await impl.deployed();
//   const admin = await ProxyAdmin.deploy(owner);
//   await admin.deployed();
//   const proxy = await TransparentUpgradableProxy.deploy(
//     impl.address,
//     owner,
//     getInitializerData(Greeter.interface, ['Hello, Hardhat!']),
//   );
//   await proxy.deployed();

//   const greeter = await upgrades.forceImport(proxy.address, Greeter);
//   t.is(await greeter.greet(), 'Hello, Hardhat!');

//   await upgrades.upgradeProxy(greeter, GreeterV2, { call: 'resetGreeting' });
//   t.is(await greeter.greet(), 'Hello World');
// });