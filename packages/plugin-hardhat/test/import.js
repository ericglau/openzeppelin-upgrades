const test = require('ava');

const { ethers, upgrades } = require('hardhat');

const ProxyAdmin = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json');
const TransparentUpgradableProxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json');

const ERC1967Proxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json');

const BeaconProxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json');
const UpgradableBeacon = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter50');
  t.context.GreeterV2 = await ethers.getContractFactory('Greeter50V2');
  // t.context.GreeterV3 = await ethers.getContractFactory('GreeterV3');
  // t.context.GreeterProxiable = await ethers.getContractFactory('GreeterProxiable');
  // t.context.GreeterV2Proxiable = await ethers.getContractFactory('GreeterV2Proxiable');
  // t.context.GreeterV3Proxiable = await ethers.getContractFactory('GreeterV3Proxiable');
  // t.context.CustomProxy = await ethers.getContractFactory('CustomProxy');
  // t.context.CustomProxyWithAdmin = await ethers.getContractFactory('CustomProxyWithAdmin');

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


test('transparent happy path', async t => {
  const { Greeter, GreeterV2, ProxyAdmin, TransparentUpgradableProxy } = t.context;

  const signerAddress = await ((await ethers.getSigners())[0]).getAddress();;

  console.log('=== signerAddress', signerAddress);

  const impl = await Greeter.deploy();
  await impl.waitForDeployment();

  const admin = await ProxyAdmin.deploy(signerAddress);
  await admin.waitForDeployment();
  
  const proxy = await TransparentUpgradableProxy.deploy(
    await impl.getAddress(),
    signerAddress,
    getInitializerData(Greeter.interface, ['Hello, Hardhat!']),
  );
  await proxy.waitForDeployment();

  const greeter = await upgrades.forceImport(await proxy.getAddress(), Greeter);
  t.is(await greeter.greet(), 'Hello, Hardhat!');

  const greeter2 = await upgrades.upgradeProxy(greeter, GreeterV2);
  await greeter2.waitForDeployment();
  t.is(await greeter2.greet(), 'Hello, Hardhat!');
  await greeter2.resetGreeting();
  t.is(await greeter2.greet(), 'Hello World');
});


test('import transparents with different admin', async t => {
  const { Greeter, GreeterV2, ProxyAdmin, TransparentUpgradableProxy } = t.context;

  const signerAddress = await ((await ethers.getSigners())[0]).getAddress();;

  const impl = await Greeter.deploy();
  await impl.waitForDeployment();
  const admin = await ProxyAdmin.deploy(signerAddress);
  await admin.waitForDeployment();
  const proxy = await TransparentUpgradableProxy.deploy(
    await impl.getAddress(),
    signerAddress,
    getInitializerData(Greeter.interface, ['Hello, Hardhat!']),
  );
  await proxy.waitForDeployment();

  const admin2 = await ProxyAdmin.deploy(signerAddress);
  await admin2.waitForDeployment();
  const proxy2 = await TransparentUpgradableProxy.deploy(
    await impl.getAddress(),
    signerAddress,
    getInitializerData(Greeter.interface, ['Hello, Hardhat 2!']),
  );
  await proxy2.waitForDeployment();

  const greeter = await upgrades.forceImport(await proxy.getAddress(), Greeter);
  const greeter2 = await upgrades.forceImport(await proxy2.getAddress(), Greeter);

  t.not(
    await upgrades.erc1967.getAdminAddress(await greeter2.getAddress()),
    await upgrades.erc1967.getAdminAddress(await greeter.getAddress()),
  );

  // proxy with a different admin can be imported
  const proxyAddress = await proxy.getAddress();
  await upgrades.upgradeProxy(proxyAddress, GreeterV2);
});
