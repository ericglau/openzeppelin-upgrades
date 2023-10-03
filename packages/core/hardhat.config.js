const fs = require('fs');
const path = require('path');

require('dotenv/config');

require('@nomicfoundation/hardhat-ethers');

const SOLIDITY_VERSION = require('./src/solidity-version.json');

for (const f of fs.readdirSync(path.join(__dirname, 'hardhat'))) {
  require(path.join(__dirname, 'hardhat', f));
}

const settings = {
  optimizer: {
    enabled: true,
    runs: 200,
  },
  outputSelection: {
    '*': {
      '*': ['storageLayout'],
    },
  },
};

const namespacedTestSettings = {
  ...settings,
  optimizer: {
    ...settings.optimizer,
    runs: settings.optimizer.runs + 1, // hack to force namespaced contracts to be compiled separately
  },
};

function getNamespacedOverrides() {
  const contracts = fs.readdirSync(path.join(__dirname, 'contracts', 'test'));
  const namespacedContracts = contracts.filter(c => c.startsWith('Namespaced'));
  const overrides = {};
  for (const c of namespacedContracts) {
    if (c === 'NamespacedToModify07.sol') {
      overrides[`contracts/test/${c}`] = { version: '0.7.6', settings: namespacedTestSettings };
    } else {
      overrides[`contracts/test/${c}`] = { version: '0.8.20', settings: namespacedTestSettings };
    }
  }
  return overrides;
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    mainnet: {
      url: 'https://cloudflare-eth.com',
    },
  },
  solidity: {
    compilers: [
      { version: '0.5.16', settings },
      { version: '0.6.12', settings },
      { version: '0.7.6', settings },
      { version: '0.8.8', settings },
      { version: '0.8.9', settings },
      { version: SOLIDITY_VERSION, settings },
    ],
    overrides: getNamespacedOverrides(),
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY,
    },
  },
};
