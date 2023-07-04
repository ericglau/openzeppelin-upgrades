const { callEtherscanApi } = require('../dist/utils/etherscan-api');
// const { verify } = require('../dist/verify-proxy');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
const { ethers, upgrades } = require('hardhat');
const hre = require('hardhat');

const test = require('ava');

const ETHERSCAN_API_KEY = 'fakeKey';

// test('mock call etherscan api', async (t) => {
//   const stub = sinon.stub().resolves({ result: '0x123' });
//   const result = await callEtherscanApi(
//     {
//       key: 'abc',
//       url: 'https://api.etherscan.io/api',
//     },
//     ['0x123'],
//   );
//   t.is(result, '0x123');
// });

test.beforeEach(async t => {
  t.context.Greeter = await ethers.getContractFactory('GreeterProxiable');


});

test('verify proxy', async t => {
  const { Greeter } = t.context;

  const greeter = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'uups' });

  // await hre.run("verify:verify", {
  //   address: await greeter.getAddress(),
  // });

  const runSuper = {};
  runSuper.isDefined = sinon.stub().returns(true);

  const callEtherscanApi = sinon.stub().returns({
    status: '1',
    result: 
      [
        {
          transactionHash: '0x123',
        }
      ]
    ,
  })

  const verifyProxy = proxyquire('../dist/verify-proxy', {
    './utils/etherscan-api': {
      getEtherscanAPIConfig: () => {
        return { key: ETHERSCAN_API_KEY };
      },
      callEtherscanApi: callEtherscanApi,
    },
  });



  return await verifyProxy.verify({ address: await greeter.getAddress() }, hre, runSuper);

});