const test = require('ava');

const { ethers, upgrades } = require('hardhat');

const BeaconProxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json');
const UpgradableBeacon = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('GreeterProxiable');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2Proxiable');
  t.context.GreeterV3 = await ethers.getContractFactory('GreeterV3Proxiable');
  t.context.BeaconProxy = await ethers.getContractFactory(BeaconProxy.abi, BeaconProxy.bytecode);
  t.context.UpgradableBeacon = await ethers.getContractFactory(UpgradableBeacon.abi, UpgradableBeacon.bytecode);
});

test('happy path', async t => {
  const { Greeter, GreeterV2, GreeterV3, UpgradableBeacon, BeaconProxy } = t.context;

  const impl = await Greeter.deploy();
  await impl.deployed();
  const beacon = await UpgradableBeacon.deploy(impl.address);
  await beacon.deployed();
  const proxy = await BeaconProxy.deploy(beacon.address, getInitializerData(Greeter.interface, ['Hello, Hardhat!']));
  await proxy.deployed();

  const greeter = await upgrades.importProxy(proxy.address, Greeter);
  t.is(await greeter.greet(), 'Hello, Hardhat!');

  await upgrades.upgradeBeacon(beacon, GreeterV2);
  const greeter2 = GreeterV2.attach(proxy.address);
  await greeter2.deployed();
  t.is(await greeter2.greet(), 'Hello, Hardhat!');
  await greeter2.resetGreeting();
  t.is(await greeter2.greet(), 'Hello World');

  const greeter3ImplAddr = await upgrades.prepareUpgrade(greeter.address, GreeterV3);
  const greeter3 = GreeterV3.attach(greeter3ImplAddr);
  const version3 = await greeter3.version();
  t.is(version3, 'V3');
});

function getInitializerData(
  contractInterface,
  args
) {
  const initializer = 'initialize';
  const fragment = contractInterface.getFunction(initializer);
  return contractInterface.encodeFunctionData(fragment, args);
}
