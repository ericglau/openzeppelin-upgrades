const test = require('ava');

const { ethers, upgrades } = require('hardhat');

const ProxyAdmin = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json');
const TransparentUpgradableProxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json');


test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2');
  t.context.ProxyAdmin = await ethers.getContractFactory(ProxyAdmin.abi, ProxyAdmin.bytecode);
  t.context.TransparentUpgradableProxy = await ethers.getContractFactory(TransparentUpgradableProxy.abi, TransparentUpgradableProxy.bytecode);
});

const NOT_MATCH_BYTECODE = /Contract does not match with implementation bytecode deployed at \S+/;

test('different kind detected', async t => {
  const { Greeter, GreeterV2, ProxyAdmin, TransparentUpgradableProxy} = t.context;

  const impl = await Greeter.deploy();
  await impl.deployed();
  const admin = await ProxyAdmin.deploy();
  await admin.deployed();
  const proxy = await TransparentUpgradableProxy.deploy(impl.address, admin.address, getInitializerData(Greeter.interface, ['Hello, Hardhat!']));
  await proxy.deployed();

  const e = await t.throwsAsync(() => upgrades.importProxy(proxy.address, GreeterV2));
  t.true(NOT_MATCH_BYTECODE.test(e.message), e.message);
});

function getInitializerData(
  contractInterface,
  args
) {
  const initializer = 'initialize';
  const fragment = contractInterface.getFunction(initializer);
  return contractInterface.encodeFunctionData(fragment, args);
}
