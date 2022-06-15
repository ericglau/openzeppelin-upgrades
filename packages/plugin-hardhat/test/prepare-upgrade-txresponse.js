const test = require('ava');

const { ethers, upgrades } = require('hardhat');
const ERC1967Proxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('GreeterProxiable');
  t.context.GreeterV3 = await ethers.getContractFactory('GreeterV3Proxiable');
  t.context.ERC1967Proxy = await ethers.getContractFactory(ERC1967Proxy.abi, ERC1967Proxy.bytecode);
});

function getInitializerData(contractInterface, args) {
  const initializer = 'initialize';
  const fragment = contractInterface.getFunction(initializer);
  return contractInterface.encodeFunctionData(fragment, args);
}

// This test case must be the first to run in this file, to ensure the imported impl does not have a txhash
test('prepare upgrade with txresponse on imported impl', async t => { 
  const { Greeter, GreeterV3, ERC1967Proxy } = t.context;

  // deploy a proxy
  const greeter = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups' });

  // import new impl
  const impl = await GreeterV3.deploy();
  await impl.deployed();
  const proxy = await ERC1967Proxy.deploy(
    impl.address,
    getInitializerData(GreeterV3.interface, ['Hello, Hardhat!']),
  );
  await proxy.deployed();
  await upgrades.forceImport(proxy.address, GreeterV3);

  // prepare the upgrade to the imported impl - should return address instead of tx response
  const addr = await upgrades.prepareUpgrade(greeter.address, GreeterV3, { getTxResponse: true });
  t.is(addr, impl.address);
});

test('prepare upgrade with txresponse', async t => {
  const { Greeter, GreeterV3 } = t.context;

  // deploy a proxy
  const greeter = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups' });

  // prepare the upgrade and get tx response
  const txResponse = await upgrades.prepareUpgrade(greeter.address, GreeterV3, { getTxResponse: true });

  const precomputedAddress = ethers.utils.getContractAddress(txResponse);
  const txReceipt = await txResponse.wait();

  t.is(txReceipt.contractAddress, precomputedAddress);

  const greeter3 = GreeterV3.attach(txReceipt.contractAddress);
  const version3 = await greeter3.version();
  t.is(version3, 'V3');
});

test('prepare upgrade twice with txresponse', async t => {
  const { Greeter, GreeterV3 } = t.context;

  // deploy a proxy
  const greeter = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups' });

  // prepare the upgrade and get tx response
  const txResponse1 = await upgrades.prepareUpgrade(greeter.address, GreeterV3, { getTxResponse: true });
  const txReceipt1 = await txResponse1.wait();

  // prepare another upgrade with the same impl
  const txResponse2 = await upgrades.prepareUpgrade(greeter.address, GreeterV3, { getTxResponse: true });
  const txReceipt2 = await txResponse2.wait();

  t.is(txReceipt2.contractAddress, txReceipt1.contractAddress);
  t.is(txReceipt2.hash, txReceipt1.hash);
});