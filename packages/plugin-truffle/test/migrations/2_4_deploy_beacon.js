const Greeter = artifacts.require('Greeter');
const Beacon = artifacts.require('Beacon');

const { deployBeaconProxy } = require('@openzeppelin/truffle-upgrades');

module.exports = async function (deployer) {
  const greeter = await Greeter.deployed();
  const beacon = await deployer.deploy(Beacon, greeter.address);
  //const beacon = await Beacon.deployed();
  await deployBeaconProxy(beacon.address, ['Hello, proxy!'], { deployer, 
    implementation: Greeter,
  });
};
