const test = require('ava');

const { ethers, upgrades } = require('hardhat');

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

test('changeProxyAdmin - wrong signer', async t => {
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

  const signer = (await ethers.getSigners())[1];

  const addr = await greeter.getAddress();
  await t.throwsAsync(() => upgrades.admin.changeProxyAdmin(addr, testAddress, signer), {
    message: /(caller is not the owner)/,
  });
});
