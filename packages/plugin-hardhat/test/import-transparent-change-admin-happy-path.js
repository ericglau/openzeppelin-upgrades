const test = require('ava');

const { ethers, upgrades, network } = require('hardhat');
const { getAdminAddress } = require('@openzeppelin/upgrades-core');

const ProxyAdmin = require('../artifacts/@openzeppelin/contracts-v4/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json');
const TransparentUpgradableProxy = require('../artifacts/@openzeppelin/contracts-v4/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json');

const testAddress = '0x1E6876a6C2757de611c9F12B23211dBaBd1C9028';

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.ProxyAdmin = await ethers.getContractFactory(ProxyAdmin.abi, ProxyAdmin.bytecode);
  t.context.TransparentUpgradableProxy = await ethers.getContractFactory(
    TransparentUpgradableProxy.abi,
    TransparentUpgradableProxy.bytecode,
  );
});

function getInitializerData(contractInterface, args) {
  const initializer = 'initialize';
  const fragment = contractInterface.getFunction(initializer);
  return contractInterface.encodeFunctionData(fragment, args);
}

test('changeProxyAdmin', async t => {
  const { Greeter, ProxyAdmin, TransparentUpgradableProxy } = t.context;

  const impl = await Greeter.deploy();
  await impl.waitForDeployment();
  const admin = await ProxyAdmin.deploy();
  await admin.waitForDeployment();
  const greeter = await TransparentUpgradableProxy.deploy(
    await impl.getAddress(),
    await admin.getAddress(),
    getInitializerData(Greeter.interface, ['Hello, Hardhat!']),
  );
  await greeter.waitForDeployment();

  const signer = (await ethers.getSigners())[0];

  await upgrades.admin.changeProxyAdmin(await greeter.getAddress(), testAddress, signer);
  const newAdmin = await getAdminAddress(network.provider, await greeter.getAddress());

  t.is(newAdmin, testAddress);
});
