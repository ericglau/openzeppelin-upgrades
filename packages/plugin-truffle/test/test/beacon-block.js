const assert = require('assert');
const { deployProxy } = require('@openzeppelin/truffle-upgrades');

const Greeter = artifacts.require('Greeter');

contract('Greeter', function () {
  it('Block deployProxy with beacon kind', async function () {
    await assert.rejects(deployProxy(Greeter, ['Hello Truffle'], { kind: 'beacon' }), error =>
      error.message.includes('Beacon proxies are not supported with the current function.'),
    );
  });
});
