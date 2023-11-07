const test = require('ava');

const hre = require('hardhat');
const ProxyAdmin = require('../artifacts/@openzeppelin/contracts-v4/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json');
const TransparentUpgradableProxy = require('../artifacts/@openzeppelin/contracts-v4/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json');

const { ethers, upgrades } = hre;

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2');

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

test('use different admin address than manifest', async t => {
  // Deploy a proxy
  const { Greeter, GreeterV2, ProxyAdmin, TransparentUpgradableProxy } = t.context;

  const impl = await Greeter.deploy();
  await impl.waitForDeployment();
  const admin = await ProxyAdmin.deploy();
  await admin.waitForDeployment();
  const proxy = await TransparentUpgradableProxy.deploy(
    await impl.getAddress(),
    await admin.getAddress(),
    getInitializerData(Greeter.interface, ['Hello, Hardhat!']),
  );
  const greeter = await upgrades.forceImport(await proxy.getAddress(), Greeter);

  // Change to new admin owned by signer 2
  const [, signer] = await ethers.getSigners();
  const newAdmin = await ProxyAdmin.deploy();
 
  await admin.changeProxyAdmin(await greeter.getAddress(), await newAdmin.getAddress());

  // Signer 1 cannot upgrade since it doesn't own the new admin
  await t.throwsAsync(() => upgrades.upgradeProxy(greeter, GreeterV2));

  // Upgrade using signer 2
  const GreeterV3 = Greeter.connect(signer);
  await upgrades.upgradeProxy(greeter, GreeterV3);

  // Change the admin again, even though current admin is not the one in the manifest
  const deployedAdmin2 = await ProxyAdmin.deploy();
  await admin.changeProxyAdmin(await greeter.getAddress(), await deployedAdmin2.getAddress(), signer);
});
