const test = require('ava');

const { ethers, upgrades } = require('hardhat');
//import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';

const ERC1967Proxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json');


test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('GreeterProxiable');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2Proxiable');
  t.context.GreeterV3 = await ethers.getContractFactory('GreeterV3Proxiable');
  t.context.ERC1967Proxy = await ethers.getContractFactory(ERC1967Proxy.abi, ERC1967Proxy.bytecode);
});

test('happy path', async t => {
  const { Greeter, GreeterV2, GreeterV3, ERC1967Proxy } = t.context;

  // manually deploy an impl and proxy
  const impl = await Greeter.deploy();
  await impl.deployed();
  console.log("Deployed impl " + impl.address);

  const proxy = await ERC1967Proxy.deploy(impl.address, getInitializerData(Greeter.interface, ['Hello, Hardhat!'], undefined));
  await proxy.deployed();
  console.log("Deployed proxy " + proxy.address);

  const greeter = Greeter.attach(proxy.address);
  t.is(await greeter.greet(), 'Hello, Hardhat!');




  const read = await upgrades.readProxy(proxy.address, Greeter, { kind: 'uups' });



  const greeter2 = await upgrades.upgradeProxy(greeter, GreeterV2);
  await greeter2.deployed();
  t.is(await greeter2.greet(), 'Hello, Hardhat!');
  await greeter2.resetGreeting();
  t.is(await greeter2.greet(), 'Hello World');

  // const greeter3ImplAddr = await upgrades.prepareUpgrade(greeter.address, GreeterV3);
  // const greeter3 = GreeterV3.attach(greeter3ImplAddr);
  // const version3 = await greeter3.version();
  // t.is(version3, 'V3');
});

/**
 * Copied from initializer-data.ts
 * TODO: reuse existing function
 */
function getInitializerData(
  contractInterface,
  args,
  initializer,
) {
  if (initializer === false) {
    return '0x';
  }

  const allowNoInitialization = initializer === undefined && args.length === 0;
  initializer = initializer ?? 'initialize';

  try {
    const fragment = contractInterface.getFunction(initializer);
    return contractInterface.encodeFunctionData(fragment, args);
  } catch (e) {
    if (e instanceof Error) {
      if (allowNoInitialization && e.message.includes('no matching function')) {
        return '0x';
      }
    }
    throw e;
  }
}
