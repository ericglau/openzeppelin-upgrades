const test = require('ava');

const { ethers, upgrades } = require('hardhat');

const ProxyAdmin = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json');
const TransparentUpgradableProxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2');
  t.context.GreeterV3 = await ethers.getContractFactory('GreeterV3');
  t.context.ProxyAdmin = await ethers.getContractFactory(ProxyAdmin.abi, ProxyAdmin.bytecode);
  t.context.TransparentUpgradableProxy = await ethers.getContractFactory(TransparentUpgradableProxy.abi, TransparentUpgradableProxy.bytecode);

  t.context.Adder = await ethers.getContractFactory('Adder');

});

test('happy path', async t => {
  const { Greeter, GreeterV2, GreeterV3, ProxyAdmin, TransparentUpgradableProxy} = t.context;

  const impl = await Greeter.deploy();
  await impl.deployed();
  const admin = await ProxyAdmin.deploy();
  await admin.deployed();
  const proxy = await TransparentUpgradableProxy.deploy(impl.address, admin.address, getInitializerData(Greeter.interface, ['Hello, Hardhat!']));
  await proxy.deployed();

  const greeter = await upgrades.importProxy(proxy.address, Greeter);
  t.is(await greeter.greet(), 'Hello, Hardhat!');

  const greeter2 = await upgrades.upgradeProxy(greeter, GreeterV2);
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
