const test = require('ava');

const { ethers, upgrades } = require('hardhat');

const ERC1967Proxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json');

test.before(async t => {
  t.context.GreeterProxiable = await ethers.getContractFactory('GreeterProxiable');
  t.context.ERC1967Proxy = await ethers.getContractFactory(ERC1967Proxy.abi, ERC1967Proxy.bytecode);
});

function getInitializerData(
  contractInterface,
  args
) {
  const initializer = 'initialize';
  const fragment = contractInterface.getFunction(initializer);
  return contractInterface.encodeFunctionData(fragment, args);
}

test('import then deploy with same impl', async t => {
  const { GreeterProxiable, ERC1967Proxy } = t.context;

  const impl = await GreeterProxiable.deploy();
  await impl.deployed();
  const proxy = await ERC1967Proxy.deploy(impl.address, getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat!']));
  await proxy.deployed();

  const greeter = await upgrades.importProxy(proxy.address, GreeterProxiable);
  t.is(await greeter.greet(), 'Hello, Hardhat!');

  const greeter2 = await upgrades.deployProxy(GreeterProxiable, ['Hello, Hardhat 2!']);
  await greeter2.deployed();

  t.is(await upgrades.erc1967.getImplementationAddress(greeter2.address), await upgrades.erc1967.getImplementationAddress(greeter.address));
});

test('deploy then import with same impl', async t => {
  const { GreeterProxiable, ERC1967Proxy } = t.context;

  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hello, Hardhat!']);
  await greeter.deployed();

  const impl = await GreeterProxiable.deploy();
  await impl.deployed();
  const proxy = await ERC1967Proxy.deploy(impl.address, getInitializerData(GreeterProxiable.interface, ['Hello, Hardhat 2!']));
  await proxy.deployed();

  const greeter2 = await upgrades.importProxy(proxy.address, GreeterProxiable);
  t.is(await greeter2.greet(), 'Hello, Hardhat 2!');

  t.not(await upgrades.erc1967.getImplementationAddress(greeter2.address), await upgrades.erc1967.getImplementationAddress(greeter.address));
});

test('import a deployed impl', async t => {
  const { GreeterProxiable } = t.context;

  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hello, Hardhat!']);
  await greeter.deployed();

  const greeterImported = await upgrades.importProxy(greeter.address, GreeterProxiable);
  t.is(await greeterImported.greet(), 'Hello, Hardhat!');

  t.is(greeterImported.address, greeter.address);
  t.is(await upgrades.erc1967.getImplementationAddress(greeterImported.address), await upgrades.erc1967.getImplementationAddress(greeter.address));
});