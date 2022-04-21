/* eslint-disable @typescript-eslint/no-var-requires */

import '@nomiclabs/hardhat-ethers';
import './type-extensions';
import { subtask, extendEnvironment, extendConfig, task } from 'hardhat/config';
import { TASK_COMPILE_SOLIDITY, TASK_COMPILE_SOLIDITY_COMPILE } from 'hardhat/builtin-tasks/task-names';
import { lazyObject } from 'hardhat/plugins';
import { HardhatConfig } from 'hardhat/types';
import { getImplementationAddressFromBeacon, getImplementationAddressFromProxy, silenceWarnings, SolcInput } from '@openzeppelin/upgrades-core';
import type { DeployFunction } from './deploy-proxy';
import type { PrepareUpgradeFunction } from './prepare-upgrade';
import type { UpgradeFunction } from './upgrade-proxy';
import type { DeployBeaconFunction } from './deploy-beacon';
import type { DeployBeaconProxyFunction } from './deploy-beacon-proxy';
import type { UpgradeBeaconFunction } from './upgrade-beacon';
import type { ForceImportFunction } from './force-import';
import type { ChangeAdminFunction, TransferProxyAdminOwnershipFunction, GetInstanceFunction } from './admin';

import { resolveEtherscanApiKey } from '@nomiclabs/hardhat-etherscan/dist/src/resolveEtherscanApiKey';
import { toCheckStatusRequest, toVerifyRequest } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanVerifyContractRequest';
import { delay, getVerificationStatus, verifyContract } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanService';
import { getProxyFactory } from './utils/factories';

import ERC1967Proxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json';


export interface HardhatUpgrades {
  deployProxy: DeployFunction;
  upgradeProxy: UpgradeFunction;
  prepareUpgrade: PrepareUpgradeFunction;
  deployBeacon: DeployBeaconFunction;
  deployBeaconProxy: DeployBeaconProxyFunction;
  upgradeBeacon: UpgradeBeaconFunction;
  forceImport: ForceImportFunction;
  silenceWarnings: typeof silenceWarnings;
  admin: {
    getInstance: GetInstanceFunction;
    changeProxyAdmin: ChangeAdminFunction;
    transferProxyAdminOwnership: TransferProxyAdminOwnershipFunction;
  };
  erc1967: {
    getAdminAddress: (proxyAdress: string) => Promise<string>;
    getImplementationAddress: (proxyAdress: string) => Promise<string>;
    getBeaconAddress: (proxyAdress: string) => Promise<string>;
  };
  beacon: {
    getImplementationAddress: (beaconAddress: string) => Promise<string>;
  };
}

interface RunCompilerArgs {
  input: SolcInput;
}

subtask(TASK_COMPILE_SOLIDITY, async (args: { force: boolean }, hre, runSuper) => {
  const { readValidations, ValidationsCacheOutdated, ValidationsCacheNotFound } = await import('./utils/validations');

  try {
    await readValidations(hre);
  } catch (e) {
    if (e instanceof ValidationsCacheOutdated || e instanceof ValidationsCacheNotFound) {
      args = { ...args, force: true };
    } else {
      throw e;
    }
  }

  return runSuper(args);
});

subtask(TASK_COMPILE_SOLIDITY_COMPILE, async (args: RunCompilerArgs, hre, runSuper) => {
  const { validate, solcInputOutputDecoder } = await import('@openzeppelin/upgrades-core');
  const { writeValidations } = await import('./utils/validations');

  // TODO: patch input
  const { output, solcBuild } = await runSuper();

  const { isFullSolcOutput } = await import('./utils/is-full-solc-output');
  if (isFullSolcOutput(output)) {
    const decodeSrc = solcInputOutputDecoder(args.input, output);
    const validations = validate(output, decodeSrc);
    await writeValidations(hre, validations);
  }

  return { output, solcBuild };
});

extendEnvironment(hre => {
  hre.upgrades = lazyObject((): HardhatUpgrades => {
    const {
      silenceWarnings,
      getAdminAddress,
      getImplementationAddress,
      getBeaconAddress,
    } = require('@openzeppelin/upgrades-core');
    const { makeDeployProxy } = require('./deploy-proxy');
    const { makeUpgradeProxy } = require('./upgrade-proxy');
    const { makePrepareUpgrade } = require('./prepare-upgrade');
    const { makeDeployBeacon } = require('./deploy-beacon');
    const { makeDeployBeaconProxy } = require('./deploy-beacon-proxy');
    const { makeUpgradeBeacon } = require('./upgrade-beacon');
    const { makeForceImport } = require('./force-import');
    const { makeChangeProxyAdmin, makeTransferProxyAdminOwnership, makeGetInstanceFunction } = require('./admin');

    return {
      silenceWarnings,
      deployProxy: makeDeployProxy(hre),
      upgradeProxy: makeUpgradeProxy(hre),
      prepareUpgrade: makePrepareUpgrade(hre),
      deployBeacon: makeDeployBeacon(hre),
      deployBeaconProxy: makeDeployBeaconProxy(hre),
      upgradeBeacon: makeUpgradeBeacon(hre),
      forceImport: makeForceImport(hre),
      admin: {
        getInstance: makeGetInstanceFunction(hre),
        changeProxyAdmin: makeChangeProxyAdmin(hre),
        transferProxyAdminOwnership: makeTransferProxyAdminOwnership(hre),
      },
      erc1967: {
        getAdminAddress: proxyAddress => getAdminAddress(hre.network.provider, proxyAddress),
        getImplementationAddress: proxyAddress => getImplementationAddress(hre.network.provider, proxyAddress),
        getBeaconAddress: proxyAddress => getBeaconAddress(hre.network.provider, proxyAddress),
      },
      beacon: {
        getImplementationAddress: beaconAddress =>
          getImplementationAddressFromBeacon(hre.network.provider, beaconAddress),
      },
    };
  });
});

extendConfig((config: HardhatConfig) => {
  for (const compiler of config.solidity.compilers) {
    compiler.settings ??= {};
    compiler.settings.outputSelection ??= {};
    compiler.settings.outputSelection['*'] ??= {};
    compiler.settings.outputSelection['*']['*'] ??= [];

    if (!compiler.settings.outputSelection['*']['*'].includes('storageLayout')) {
      compiler.settings.outputSelection['*']['*'].push('storageLayout');
    }
  }
});

// Separate task:
// task("verify-proxy")
//   .addPositionalParam("address", "Address of the proxy to verify")
//   .setAction(async (args, hre) => {
//     const address = await getImplementationAddressFromProxy(hre.network.provider, args.address);
//     console.log(`Verifying implementation ${address} for proxy ${args.address}`);
//     await hre.run("verify", { "address": address });
//   });

const solcInput = {
  "language": "Solidity",
  "sources": {
    "contracts/import.sol": {
      "content": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\nimport \"@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol\";\nimport \"@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol\";\nimport \"@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol\";\nimport \"@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol\";\nimport \"@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol\";\n\n// Kept for backwards compatibility with older versions of Hardhat and Truffle plugins.\ncontract AdminUpgradeabilityProxy is TransparentUpgradeableProxy {\n    constructor(address logic, address admin, bytes memory data) payable TransparentUpgradeableProxy(logic, admin, data) {}\n}\n"
    },
    "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\nimport \"./IBeacon.sol\";\nimport \"../Proxy.sol\";\nimport \"../ERC1967/ERC1967Upgrade.sol\";\n\n/**\n * @dev This contract implements a proxy that gets the implementation address for each call from a {UpgradeableBeacon}.\n *\n * The beacon address is stored in storage slot `uint256(keccak256('eip1967.proxy.beacon')) - 1`, so that it doesn't\n * conflict with the storage layout of the implementation behind the proxy.\n *\n * _Available since v3.4._\n */\ncontract BeaconProxy is Proxy, ERC1967Upgrade {\n    /**\n     * @dev Initializes the proxy with `beacon`.\n     *\n     * If `data` is nonempty, it's used as data in a delegate call to the implementation returned by the beacon. This\n     * will typically be an encoded function call, and allows initializating the storage of the proxy like a Solidity\n     * constructor.\n     *\n     * Requirements:\n     *\n     * - `beacon` must be a contract with the interface {IBeacon}.\n     */\n    constructor(address beacon, bytes memory data) payable {\n        assert(_BEACON_SLOT == bytes32(uint256(keccak256(\"eip1967.proxy.beacon\")) - 1));\n        _upgradeBeaconToAndCall(beacon, data, false);\n    }\n\n    /**\n     * @dev Returns the current beacon address.\n     */\n    function _beacon() internal view virtual returns (address) {\n        return _getBeacon();\n    }\n\n    /**\n     * @dev Returns the current implementation address of the associated beacon.\n     */\n    function _implementation() internal view virtual override returns (address) {\n        return IBeacon(_getBeacon()).implementation();\n    }\n\n    /**\n     * @dev Changes the proxy to use a new beacon. Deprecated: see {_upgradeBeaconToAndCall}.\n     *\n     * If `data` is nonempty, it's used as data in a delegate call to the implementation returned by the beacon.\n     *\n     * Requirements:\n     *\n     * - `beacon` must be a contract.\n     * - The implementation returned by `beacon` must be a contract.\n     */\n    function _setBeacon(address beacon, bytes memory data) internal virtual {\n        _upgradeBeaconToAndCall(beacon, data, false);\n    }\n}\n"
    },
    "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\nimport \"./IBeacon.sol\";\nimport \"../../access/Ownable.sol\";\nimport \"../../utils/Address.sol\";\n\n/**\n * @dev This contract is used in conjunction with one or more instances of {BeaconProxy} to determine their\n * implementation contract, which is where they will delegate all function calls.\n *\n * An owner is able to change the implementation the beacon points to, thus upgrading the proxies that use this beacon.\n */\ncontract UpgradeableBeacon is IBeacon, Ownable {\n    address private _implementation;\n\n    /**\n     * @dev Emitted when the implementation returned by the beacon is changed.\n     */\n    event Upgraded(address indexed implementation);\n\n    /**\n     * @dev Sets the address of the initial implementation, and the deployer account as the owner who can upgrade the\n     * beacon.\n     */\n    constructor(address implementation_) {\n        _setImplementation(implementation_);\n    }\n\n    /**\n     * @dev Returns the current implementation address.\n     */\n    function implementation() public view virtual override returns (address) {\n        return _implementation;\n    }\n\n    /**\n     * @dev Upgrades the beacon to a new implementation.\n     *\n     * Emits an {Upgraded} event.\n     *\n     * Requirements:\n     *\n     * - msg.sender must be the owner of the contract.\n     * - `newImplementation` must be a contract.\n     */\n    function upgradeTo(address newImplementation) public virtual onlyOwner {\n        _setImplementation(newImplementation);\n        emit Upgraded(newImplementation);\n    }\n\n    /**\n     * @dev Sets the implementation contract address for this beacon\n     *\n     * Requirements:\n     *\n     * - `newImplementation` must be a contract.\n     */\n    function _setImplementation(address newImplementation) private {\n        require(Address.isContract(newImplementation), \"UpgradeableBeacon: implementation is not a contract\");\n        _implementation = newImplementation;\n    }\n}\n"
    },
    "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\nimport \"../Proxy.sol\";\nimport \"./ERC1967Upgrade.sol\";\n\n/**\n * @dev This contract implements an upgradeable proxy. It is upgradeable because calls are delegated to an\n * implementation address that can be changed. This address is stored in storage in the location specified by\n * https://eips.ethereum.org/EIPS/eip-1967[EIP1967], so that it doesn't conflict with the storage layout of the\n * implementation behind the proxy.\n */\ncontract ERC1967Proxy is Proxy, ERC1967Upgrade {\n    /**\n     * @dev Initializes the upgradeable proxy with an initial implementation specified by `_logic`.\n     *\n     * If `_data` is nonempty, it's used as data in a delegate call to `_logic`. This will typically be an encoded\n     * function call, and allows initializating the storage of the proxy like a Solidity constructor.\n     */\n    constructor(address _logic, bytes memory _data) payable {\n        assert(_IMPLEMENTATION_SLOT == bytes32(uint256(keccak256(\"eip1967.proxy.implementation\")) - 1));\n        _upgradeToAndCall(_logic, _data, false);\n    }\n\n    /**\n     * @dev Returns the current implementation address.\n     */\n    function _implementation() internal view virtual override returns (address impl) {\n        return ERC1967Upgrade._getImplementation();\n    }\n}\n"
    },
    "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\nimport \"../ERC1967/ERC1967Proxy.sol\";\n\n/**\n * @dev This contract implements a proxy that is upgradeable by an admin.\n *\n * To avoid https://medium.com/nomic-labs-blog/malicious-backdoors-in-ethereum-proxies-62629adf3357[proxy selector\n * clashing], which can potentially be used in an attack, this contract uses the\n * https://blog.openzeppelin.com/the-transparent-proxy-pattern/[transparent proxy pattern]. This pattern implies two\n * things that go hand in hand:\n *\n * 1. If any account other than the admin calls the proxy, the call will be forwarded to the implementation, even if\n * that call matches one of the admin functions exposed by the proxy itself.\n * 2. If the admin calls the proxy, it can access the admin functions, but its calls will never be forwarded to the\n * implementation. If the admin tries to call a function on the implementation it will fail with an error that says\n * \"admin cannot fallback to proxy target\".\n *\n * These properties mean that the admin account can only be used for admin actions like upgrading the proxy or changing\n * the admin, so it's best if it's a dedicated account that is not used for anything else. This will avoid headaches due\n * to sudden errors when trying to call a function from the proxy implementation.\n *\n * Our recommendation is for the dedicated account to be an instance of the {ProxyAdmin} contract. If set up this way,\n * you should think of the `ProxyAdmin` instance as the real administrative interface of your proxy.\n */\ncontract TransparentUpgradeableProxy is ERC1967Proxy {\n    /**\n     * @dev Initializes an upgradeable proxy managed by `_admin`, backed by the implementation at `_logic`, and\n     * optionally initialized with `_data` as explained in {ERC1967Proxy-constructor}.\n     */\n    constructor(address _logic, address admin_, bytes memory _data) payable ERC1967Proxy(_logic, _data) {\n        assert(_ADMIN_SLOT == bytes32(uint256(keccak256(\"eip1967.proxy.admin\")) - 1));\n        _changeAdmin(admin_);\n    }\n\n    /**\n     * @dev Modifier used internally that will delegate the call to the implementation unless the sender is the admin.\n     */\n    modifier ifAdmin() {\n        if (msg.sender == _getAdmin()) {\n            _;\n        } else {\n            _fallback();\n        }\n    }\n\n    /**\n     * @dev Returns the current admin.\n     *\n     * NOTE: Only the admin can call this function. See {ProxyAdmin-getProxyAdmin}.\n     *\n     * TIP: To get this value clients can read directly from the storage slot shown below (specified by EIP1967) using the\n     * https://eth.wiki/json-rpc/API#eth_getstorageat[`eth_getStorageAt`] RPC call.\n     * `0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103`\n     */\n    function admin() external ifAdmin returns (address admin_) {\n        admin_ = _getAdmin();\n    }\n\n    /**\n     * @dev Returns the current implementation.\n     *\n     * NOTE: Only the admin can call this function. See {ProxyAdmin-getProxyImplementation}.\n     *\n     * TIP: To get this value clients can read directly from the storage slot shown below (specified by EIP1967) using the\n     * https://eth.wiki/json-rpc/API#eth_getstorageat[`eth_getStorageAt`] RPC call.\n     * `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`\n     */\n    function implementation() external ifAdmin returns (address implementation_) {\n        implementation_ = _implementation();\n    }\n\n    /**\n     * @dev Changes the admin of the proxy.\n     *\n     * Emits an {AdminChanged} event.\n     *\n     * NOTE: Only the admin can call this function. See {ProxyAdmin-changeProxyAdmin}.\n     */\n    function changeAdmin(address newAdmin) external virtual ifAdmin {\n        _changeAdmin(newAdmin);\n    }\n\n    /**\n     * @dev Upgrade the implementation of the proxy.\n     *\n     * NOTE: Only the admin can call this function. See {ProxyAdmin-upgrade}.\n     */\n    function upgradeTo(address newImplementation) external ifAdmin {\n        _upgradeToAndCall(newImplementation, bytes(\"\"), false);\n    }\n\n    /**\n     * @dev Upgrade the implementation of the proxy, and then call a function from the new implementation as specified\n     * by `data`, which should be an encoded function call. This is useful to initialize new storage variables in the\n     * proxied contract.\n     *\n     * NOTE: Only the admin can call this function. See {ProxyAdmin-upgradeAndCall}.\n     */\n    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable ifAdmin {\n        _upgradeToAndCall(newImplementation, data, true);\n    }\n\n    /**\n     * @dev Returns the current admin.\n     */\n    function _admin() internal view virtual returns (address) {\n        return _getAdmin();\n    }\n\n    /**\n     * @dev Makes sure the admin cannot access the fallback function. See {Proxy-_beforeFallback}.\n     */\n    function _beforeFallback() internal virtual override {\n        require(msg.sender != _getAdmin(), \"TransparentUpgradeableProxy: admin cannot fallback to proxy target\");\n        super._beforeFallback();\n    }\n}\n"
    },
    "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\nimport \"./TransparentUpgradeableProxy.sol\";\nimport \"../../access/Ownable.sol\";\n\n/**\n * @dev This is an auxiliary contract meant to be assigned as the admin of a {TransparentUpgradeableProxy}. For an\n * explanation of why you would want to use this see the documentation for {TransparentUpgradeableProxy}.\n */\ncontract ProxyAdmin is Ownable {\n\n    /**\n     * @dev Returns the current implementation of `proxy`.\n     *\n     * Requirements:\n     *\n     * - This contract must be the admin of `proxy`.\n     */\n    function getProxyImplementation(TransparentUpgradeableProxy proxy) public view virtual returns (address) {\n        // We need to manually run the static call since the getter cannot be flagged as view\n        // bytes4(keccak256(\"implementation()\")) == 0x5c60da1b\n        (bool success, bytes memory returndata) = address(proxy).staticcall(hex\"5c60da1b\");\n        require(success);\n        return abi.decode(returndata, (address));\n    }\n\n    /**\n     * @dev Returns the current admin of `proxy`.\n     *\n     * Requirements:\n     *\n     * - This contract must be the admin of `proxy`.\n     */\n    function getProxyAdmin(TransparentUpgradeableProxy proxy) public view virtual returns (address) {\n        // We need to manually run the static call since the getter cannot be flagged as view\n        // bytes4(keccak256(\"admin()\")) == 0xf851a440\n        (bool success, bytes memory returndata) = address(proxy).staticcall(hex\"f851a440\");\n        require(success);\n        return abi.decode(returndata, (address));\n    }\n\n    /**\n     * @dev Changes the admin of `proxy` to `newAdmin`.\n     *\n     * Requirements:\n     *\n     * - This contract must be the current admin of `proxy`.\n     */\n    function changeProxyAdmin(TransparentUpgradeableProxy proxy, address newAdmin) public virtual onlyOwner {\n        proxy.changeAdmin(newAdmin);\n    }\n\n    /**\n     * @dev Upgrades `proxy` to `implementation`. See {TransparentUpgradeableProxy-upgradeTo}.\n     *\n     * Requirements:\n     *\n     * - This contract must be the admin of `proxy`.\n     */\n    function upgrade(TransparentUpgradeableProxy proxy, address implementation) public virtual onlyOwner {\n        proxy.upgradeTo(implementation);\n    }\n\n    /**\n     * @dev Upgrades `proxy` to `implementation` and calls a function on the new implementation. See\n     * {TransparentUpgradeableProxy-upgradeToAndCall}.\n     *\n     * Requirements:\n     *\n     * - This contract must be the admin of `proxy`.\n     */\n    function upgradeAndCall(TransparentUpgradeableProxy proxy, address implementation, bytes memory data) public payable virtual onlyOwner {\n        proxy.upgradeToAndCall{value: msg.value}(implementation, data);\n    }\n}\n"
    },
    "@openzeppelin/contracts/proxy/beacon/IBeacon.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\n/**\n * @dev This is the interface that {BeaconProxy} expects of its beacon.\n */\ninterface IBeacon {\n    /**\n     * @dev Must return an address that can be used as a delegate call target.\n     *\n     * {BeaconProxy} will check that this address is a contract.\n     */\n    function implementation() external view returns (address);\n}\n"
    },
    "@openzeppelin/contracts/proxy/Proxy.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\n/**\n * @dev This abstract contract provides a fallback function that delegates all calls to another contract using the EVM\n * instruction `delegatecall`. We refer to the second contract as the _implementation_ behind the proxy, and it has to\n * be specified by overriding the virtual {_implementation} function.\n *\n * Additionally, delegation to the implementation can be triggered manually through the {_fallback} function, or to a\n * different contract through the {_delegate} function.\n *\n * The success and return data of the delegated call will be returned back to the caller of the proxy.\n */\nabstract contract Proxy {\n    /**\n     * @dev Delegates the current call to `implementation`.\n     *\n     * This function does not return to its internall call site, it will return directly to the external caller.\n     */\n    function _delegate(address implementation) internal virtual {\n        // solhint-disable-next-line no-inline-assembly\n        assembly {\n            // Copy msg.data. We take full control of memory in this inline assembly\n            // block because it will not return to Solidity code. We overwrite the\n            // Solidity scratch pad at memory position 0.\n            calldatacopy(0, 0, calldatasize())\n\n            // Call the implementation.\n            // out and outsize are 0 because we don't know the size yet.\n            let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)\n\n            // Copy the returned data.\n            returndatacopy(0, 0, returndatasize())\n\n            switch result\n            // delegatecall returns 0 on error.\n            case 0 { revert(0, returndatasize()) }\n            default { return(0, returndatasize()) }\n        }\n    }\n\n    /**\n     * @dev This is a virtual function that should be overriden so it returns the address to which the fallback function\n     * and {_fallback} should delegate.\n     */\n    function _implementation() internal view virtual returns (address);\n\n    /**\n     * @dev Delegates the current call to the address returned by `_implementation()`.\n     *\n     * This function does not return to its internall call site, it will return directly to the external caller.\n     */\n    function _fallback() internal virtual {\n        _beforeFallback();\n        _delegate(_implementation());\n    }\n\n    /**\n     * @dev Fallback function that delegates calls to the address returned by `_implementation()`. Will run if no other\n     * function in the contract matches the call data.\n     */\n    fallback () external payable virtual {\n        _fallback();\n    }\n\n    /**\n     * @dev Fallback function that delegates calls to the address returned by `_implementation()`. Will run if call data\n     * is empty.\n     */\n    receive () external payable virtual {\n        _fallback();\n    }\n\n    /**\n     * @dev Hook that is called before falling back to the implementation. Can happen as part of a manual `_fallback`\n     * call, or as part of the Solidity `fallback` or `receive` functions.\n     *\n     * If overriden should call `super._beforeFallback()`.\n     */\n    function _beforeFallback() internal virtual {\n    }\n}\n"
    },
    "@openzeppelin/contracts/proxy/ERC1967/ERC1967Upgrade.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.2;\n\nimport \"../beacon/IBeacon.sol\";\nimport \"../../utils/Address.sol\";\nimport \"../../utils/StorageSlot.sol\";\n\n/**\n * @dev This abstract contract provides getters and event emitting update functions for\n * https://eips.ethereum.org/EIPS/eip-1967[EIP1967] slots.\n *\n * _Available since v4.1._\n *\n * @custom:oz-upgrades-unsafe-allow delegatecall\n */\nabstract contract ERC1967Upgrade {\n    // This is the keccak-256 hash of \"eip1967.proxy.rollback\" subtracted by 1\n    bytes32 private constant _ROLLBACK_SLOT = 0x4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd9143;\n\n    /**\n     * @dev Storage slot with the address of the current implementation.\n     * This is the keccak-256 hash of \"eip1967.proxy.implementation\" subtracted by 1, and is\n     * validated in the constructor.\n     */\n    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;\n\n    /**\n     * @dev Emitted when the implementation is upgraded.\n     */\n    event Upgraded(address indexed implementation);\n\n    /**\n     * @dev Returns the current implementation address.\n     */\n    function _getImplementation() internal view returns (address) {\n        return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;\n    }\n\n    /**\n     * @dev Stores a new address in the EIP1967 implementation slot.\n     */\n    function _setImplementation(address newImplementation) private {\n        require(Address.isContract(newImplementation), \"ERC1967: new implementation is not a contract\");\n        StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;\n    }\n\n    /**\n     * @dev Perform implementation upgrade\n     *\n     * Emits an {Upgraded} event.\n     */\n    function _upgradeTo(address newImplementation) internal {\n        _setImplementation(newImplementation);\n        emit Upgraded(newImplementation);\n    }\n\n    /**\n     * @dev Perform implementation upgrade with additional setup call.\n     *\n     * Emits an {Upgraded} event.\n     */\n    function _upgradeToAndCall(address newImplementation, bytes memory data, bool forceCall) internal {\n        _setImplementation(newImplementation);\n        emit Upgraded(newImplementation);\n        if (data.length > 0 || forceCall) {\n            Address.functionDelegateCall(newImplementation, data);\n        }\n    }\n\n    /**\n     * @dev Perform implementation upgrade with security checks for UUPS proxies, and additional setup call.\n     *\n     * Emits an {Upgraded} event.\n     */\n    function _upgradeToAndCallSecure(address newImplementation, bytes memory data, bool forceCall) internal {\n        address oldImplementation = _getImplementation();\n\n        // Initial upgrade and setup call\n        _setImplementation(newImplementation);\n        if (data.length > 0 || forceCall) {\n            Address.functionDelegateCall(newImplementation, data);\n        }\n\n        // Perform rollback test if not already in progress\n        StorageSlot.BooleanSlot storage rollbackTesting = StorageSlot.getBooleanSlot(_ROLLBACK_SLOT);\n        if (!rollbackTesting.value) {\n            // Trigger rollback using upgradeTo from the new implementation\n            rollbackTesting.value = true;\n            Address.functionDelegateCall(\n                newImplementation,\n                abi.encodeWithSignature(\n                    \"upgradeTo(address)\",\n                    oldImplementation\n                )\n            );\n            rollbackTesting.value = false;\n            // Check rollback was effective\n            require(oldImplementation == _getImplementation(), \"ERC1967Upgrade: upgrade breaks further upgrades\");\n            // Finally reset to the new implementation and log the upgrade\n            _setImplementation(newImplementation);\n            emit Upgraded(newImplementation);\n        }\n    }\n\n    /**\n     * @dev Perform beacon upgrade with additional setup call. Note: This upgrades the address of the beacon, it does\n     * not upgrade the implementation contained in the beacon (see {UpgradeableBeacon-_setImplementation} for that).\n     *\n     * Emits a {BeaconUpgraded} event.\n     */\n    function _upgradeBeaconToAndCall(address newBeacon, bytes memory data, bool forceCall) internal {\n        _setBeacon(newBeacon);\n        emit BeaconUpgraded(newBeacon);\n        if (data.length > 0 || forceCall) {\n            Address.functionDelegateCall(IBeacon(newBeacon).implementation(), data);\n        }\n    }\n\n    /**\n     * @dev Storage slot with the admin of the contract.\n     * This is the keccak-256 hash of \"eip1967.proxy.admin\" subtracted by 1, and is\n     * validated in the constructor.\n     */\n    bytes32 internal constant _ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;\n\n    /**\n     * @dev Emitted when the admin account has changed.\n     */\n    event AdminChanged(address previousAdmin, address newAdmin);\n\n    /**\n     * @dev Returns the current admin.\n     */\n    function _getAdmin() internal view returns (address) {\n        return StorageSlot.getAddressSlot(_ADMIN_SLOT).value;\n    }\n\n    /**\n     * @dev Stores a new address in the EIP1967 admin slot.\n     */\n    function _setAdmin(address newAdmin) private {\n        require(newAdmin != address(0), \"ERC1967: new admin is the zero address\");\n        StorageSlot.getAddressSlot(_ADMIN_SLOT).value = newAdmin;\n    }\n\n    /**\n     * @dev Changes the admin of the proxy.\n     *\n     * Emits an {AdminChanged} event.\n     */\n    function _changeAdmin(address newAdmin) internal {\n        emit AdminChanged(_getAdmin(), newAdmin);\n        _setAdmin(newAdmin);\n    }\n\n    /**\n     * @dev The storage slot of the UpgradeableBeacon contract which defines the implementation for this proxy.\n     * This is bytes32(uint256(keccak256('eip1967.proxy.beacon')) - 1)) and is validated in the constructor.\n     */\n    bytes32 internal constant _BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;\n\n    /**\n     * @dev Emitted when the beacon is upgraded.\n     */\n    event BeaconUpgraded(address indexed beacon);\n\n    /**\n     * @dev Returns the current beacon.\n     */\n    function _getBeacon() internal view returns (address) {\n        return StorageSlot.getAddressSlot(_BEACON_SLOT).value;\n    }\n\n    /**\n     * @dev Stores a new beacon in the EIP1967 beacon slot.\n     */\n    function _setBeacon(address newBeacon) private {\n        require(\n            Address.isContract(newBeacon),\n            \"ERC1967: new beacon is not a contract\"\n        );\n        require(\n            Address.isContract(IBeacon(newBeacon).implementation()),\n            \"ERC1967: beacon implementation is not a contract\"\n        );\n        StorageSlot.getAddressSlot(_BEACON_SLOT).value = newBeacon;\n    }\n}\n"
    },
    "@openzeppelin/contracts/utils/Address.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\n/**\n * @dev Collection of functions related to the address type\n */\nlibrary Address {\n    /**\n     * @dev Returns true if `account` is a contract.\n     *\n     * [IMPORTANT]\n     * ====\n     * It is unsafe to assume that an address for which this function returns\n     * false is an externally-owned account (EOA) and not a contract.\n     *\n     * Among others, `isContract` will return false for the following\n     * types of addresses:\n     *\n     *  - an externally-owned account\n     *  - a contract in construction\n     *  - an address where a contract will be created\n     *  - an address where a contract lived, but was destroyed\n     * ====\n     */\n    function isContract(address account) internal view returns (bool) {\n        // This method relies on extcodesize, which returns 0 for contracts in\n        // construction, since the code is only stored at the end of the\n        // constructor execution.\n\n        uint256 size;\n        // solhint-disable-next-line no-inline-assembly\n        assembly { size := extcodesize(account) }\n        return size > 0;\n    }\n\n    /**\n     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to\n     * `recipient`, forwarding all available gas and reverting on errors.\n     *\n     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost\n     * of certain opcodes, possibly making contracts go over the 2300 gas limit\n     * imposed by `transfer`, making them unable to receive funds via\n     * `transfer`. {sendValue} removes this limitation.\n     *\n     * https://diligence.consensys.net/posts/2019/09/stop-using-soliditys-transfer-now/[Learn more].\n     *\n     * IMPORTANT: because control is transferred to `recipient`, care must be\n     * taken to not create reentrancy vulnerabilities. Consider using\n     * {ReentrancyGuard} or the\n     * https://solidity.readthedocs.io/en/v0.5.11/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].\n     */\n    function sendValue(address payable recipient, uint256 amount) internal {\n        require(address(this).balance >= amount, \"Address: insufficient balance\");\n\n        // solhint-disable-next-line avoid-low-level-calls, avoid-call-value\n        (bool success, ) = recipient.call{ value: amount }(\"\");\n        require(success, \"Address: unable to send value, recipient may have reverted\");\n    }\n\n    /**\n     * @dev Performs a Solidity function call using a low level `call`. A\n     * plain`call` is an unsafe replacement for a function call: use this\n     * function instead.\n     *\n     * If `target` reverts with a revert reason, it is bubbled up by this\n     * function (like regular Solidity function calls).\n     *\n     * Returns the raw returned data. To convert to the expected return value,\n     * use https://solidity.readthedocs.io/en/latest/units-and-global-variables.html?highlight=abi.decode#abi-encoding-and-decoding-functions[`abi.decode`].\n     *\n     * Requirements:\n     *\n     * - `target` must be a contract.\n     * - calling `target` with `data` must not revert.\n     *\n     * _Available since v3.1._\n     */\n    function functionCall(address target, bytes memory data) internal returns (bytes memory) {\n      return functionCall(target, data, \"Address: low-level call failed\");\n    }\n\n    /**\n     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`], but with\n     * `errorMessage` as a fallback revert reason when `target` reverts.\n     *\n     * _Available since v3.1._\n     */\n    function functionCall(address target, bytes memory data, string memory errorMessage) internal returns (bytes memory) {\n        return functionCallWithValue(target, data, 0, errorMessage);\n    }\n\n    /**\n     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],\n     * but also transferring `value` wei to `target`.\n     *\n     * Requirements:\n     *\n     * - the calling contract must have an ETH balance of at least `value`.\n     * - the called Solidity function must be `payable`.\n     *\n     * _Available since v3.1._\n     */\n    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {\n        return functionCallWithValue(target, data, value, \"Address: low-level call with value failed\");\n    }\n\n    /**\n     * @dev Same as {xref-Address-functionCallWithValue-address-bytes-uint256-}[`functionCallWithValue`], but\n     * with `errorMessage` as a fallback revert reason when `target` reverts.\n     *\n     * _Available since v3.1._\n     */\n    function functionCallWithValue(address target, bytes memory data, uint256 value, string memory errorMessage) internal returns (bytes memory) {\n        require(address(this).balance >= value, \"Address: insufficient balance for call\");\n        require(isContract(target), \"Address: call to non-contract\");\n\n        // solhint-disable-next-line avoid-low-level-calls\n        (bool success, bytes memory returndata) = target.call{ value: value }(data);\n        return _verifyCallResult(success, returndata, errorMessage);\n    }\n\n    /**\n     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],\n     * but performing a static call.\n     *\n     * _Available since v3.3._\n     */\n    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {\n        return functionStaticCall(target, data, \"Address: low-level static call failed\");\n    }\n\n    /**\n     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],\n     * but performing a static call.\n     *\n     * _Available since v3.3._\n     */\n    function functionStaticCall(address target, bytes memory data, string memory errorMessage) internal view returns (bytes memory) {\n        require(isContract(target), \"Address: static call to non-contract\");\n\n        // solhint-disable-next-line avoid-low-level-calls\n        (bool success, bytes memory returndata) = target.staticcall(data);\n        return _verifyCallResult(success, returndata, errorMessage);\n    }\n\n    /**\n     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],\n     * but performing a delegate call.\n     *\n     * _Available since v3.4._\n     */\n    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {\n        return functionDelegateCall(target, data, \"Address: low-level delegate call failed\");\n    }\n\n    /**\n     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],\n     * but performing a delegate call.\n     *\n     * _Available since v3.4._\n     */\n    function functionDelegateCall(address target, bytes memory data, string memory errorMessage) internal returns (bytes memory) {\n        require(isContract(target), \"Address: delegate call to non-contract\");\n\n        // solhint-disable-next-line avoid-low-level-calls\n        (bool success, bytes memory returndata) = target.delegatecall(data);\n        return _verifyCallResult(success, returndata, errorMessage);\n    }\n\n    function _verifyCallResult(bool success, bytes memory returndata, string memory errorMessage) private pure returns(bytes memory) {\n        if (success) {\n            return returndata;\n        } else {\n            // Look for revert reason and bubble it up if present\n            if (returndata.length > 0) {\n                // The easiest way to bubble the revert reason is using memory via assembly\n\n                // solhint-disable-next-line no-inline-assembly\n                assembly {\n                    let returndata_size := mload(returndata)\n                    revert(add(32, returndata), returndata_size)\n                }\n            } else {\n                revert(errorMessage);\n            }\n        }\n    }\n}\n"
    },
    "@openzeppelin/contracts/utils/StorageSlot.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\n/**\n * @dev Library for reading and writing primitive types to specific storage slots.\n *\n * Storage slots are often used to avoid storage conflict when dealing with upgradeable contracts.\n * This library helps with reading and writing to such slots without the need for inline assembly.\n *\n * The functions in this library return Slot structs that contain a `value` member that can be used to read or write.\n *\n * Example usage to set ERC1967 implementation slot:\n * ```\n * contract ERC1967 {\n *     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;\n *\n *     function _getImplementation() internal view returns (address) {\n *         return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;\n *     }\n *\n *     function _setImplementation(address newImplementation) internal {\n *         require(Address.isContract(newImplementation), \"ERC1967: new implementation is not a contract\");\n *         StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;\n *     }\n * }\n * ```\n *\n * _Available since v4.1 for `address`, `bool`, `bytes32`, and `uint256`._\n */\nlibrary StorageSlot {\n    struct AddressSlot {\n        address value;\n    }\n\n    struct BooleanSlot {\n        bool value;\n    }\n\n    struct Bytes32Slot {\n        bytes32 value;\n    }\n\n    struct Uint256Slot {\n        uint256 value;\n    }\n\n    /**\n     * @dev Returns an `AddressSlot` with member `value` located at `slot`.\n     */\n    function getAddressSlot(bytes32 slot) internal pure returns (AddressSlot storage r) {\n        assembly {\n            r.slot := slot\n        }\n    }\n\n    /**\n     * @dev Returns an `BooleanSlot` with member `value` located at `slot`.\n     */\n    function getBooleanSlot(bytes32 slot) internal pure returns (BooleanSlot storage r) {\n        assembly {\n            r.slot := slot\n        }\n    }\n\n    /**\n     * @dev Returns an `Bytes32Slot` with member `value` located at `slot`.\n     */\n    function getBytes32Slot(bytes32 slot) internal pure returns (Bytes32Slot storage r) {\n        assembly {\n            r.slot := slot\n        }\n    }\n\n    /**\n     * @dev Returns an `Uint256Slot` with member `value` located at `slot`.\n     */\n    function getUint256Slot(bytes32 slot) internal pure returns (Uint256Slot storage r) {\n        assembly {\n            r.slot := slot\n        }\n    }\n}\n"
    },
    "@openzeppelin/contracts/access/Ownable.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\nimport \"../utils/Context.sol\";\n/**\n * @dev Contract module which provides a basic access control mechanism, where\n * there is an account (an owner) that can be granted exclusive access to\n * specific functions.\n *\n * By default, the owner account will be the one that deploys the contract. This\n * can later be changed with {transferOwnership}.\n *\n * This module is used through inheritance. It will make available the modifier\n * `onlyOwner`, which can be applied to your functions to restrict their use to\n * the owner.\n */\nabstract contract Ownable is Context {\n    address private _owner;\n\n    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);\n\n    /**\n     * @dev Initializes the contract setting the deployer as the initial owner.\n     */\n    constructor () {\n        address msgSender = _msgSender();\n        _owner = msgSender;\n        emit OwnershipTransferred(address(0), msgSender);\n    }\n\n    /**\n     * @dev Returns the address of the current owner.\n     */\n    function owner() public view virtual returns (address) {\n        return _owner;\n    }\n\n    /**\n     * @dev Throws if called by any account other than the owner.\n     */\n    modifier onlyOwner() {\n        require(owner() == _msgSender(), \"Ownable: caller is not the owner\");\n        _;\n    }\n\n    /**\n     * @dev Leaves the contract without owner. It will not be possible to call\n     * `onlyOwner` functions anymore. Can only be called by the current owner.\n     *\n     * NOTE: Renouncing ownership will leave the contract without an owner,\n     * thereby removing any functionality that is only available to the owner.\n     */\n    function renounceOwnership() public virtual onlyOwner {\n        emit OwnershipTransferred(_owner, address(0));\n        _owner = address(0);\n    }\n\n    /**\n     * @dev Transfers ownership of the contract to a new account (`newOwner`).\n     * Can only be called by the current owner.\n     */\n    function transferOwnership(address newOwner) public virtual onlyOwner {\n        require(newOwner != address(0), \"Ownable: new owner is the zero address\");\n        emit OwnershipTransferred(_owner, newOwner);\n        _owner = newOwner;\n    }\n}\n"
    },
    "@openzeppelin/contracts/utils/Context.sol": {
      "content": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.0;\n\n/*\n * @dev Provides information about the current execution context, including the\n * sender of the transaction and its data. While these are generally available\n * via msg.sender and msg.data, they should not be accessed in such a direct\n * manner, since when dealing with meta-transactions the account sending and\n * paying for execution may not be the actual sender (as far as an application\n * is concerned).\n *\n * This contract is only required for intermediate, library-like contracts.\n */\nabstract contract Context {\n    function _msgSender() internal view virtual returns (address) {\n        return msg.sender;\n    }\n\n    function _msgData() internal view virtual returns (bytes calldata) {\n        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691\n        return msg.data;\n    }\n}\n"
    }
  }
}

// Override task:
task("verify")
  .setAction(async (args, hre, runSuper) => {
    const proxyAddress = args.address;

    const address = await getImplementationAddressFromProxy(hre.network.provider, proxyAddress);
    console.log(`Verifying implementation ${address} for proxy ${proxyAddress}`);

    const etherscanAPIEndpoints = await hre.run("verify:get-etherscan-endpoint");
    console.log(`Etherscan endpoint urls: ${JSON.stringify(etherscanAPIEndpoints)}`);

    const config: any = hre.config; // TODO use an interface
    console.log(`Etherscan config: ${JSON.stringify(config.etherscan)}`);

    const etherscanAPIKey = resolveEtherscanApiKey(
      config.etherscan,
      etherscanAPIEndpoints.network
    );

    

    // const uupsProxyFactory = await getProxyFactory(hre);
    // console.log("Proxy: " + JSON.stringify(uupsProxyFactory));

    const params = {
      apiKey: etherscanAPIKey,
      contractAddress: proxyAddress,
      sourceCode: JSON.stringify(solcInput),
      sourceName: ERC1967Proxy.sourceName, //'@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol', //contractInformation.sourceName,
      contractName: ERC1967Proxy.contractName, //'ERC1967Proxy', //contractInformation.contractName,
      compilerVersion:  "v0.8.2+commit.661d1103", //solcFullVersion,
      constructorArguments: '00000000000000000000000029a84d93754d766aef661cdba5d9ced07029d78200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000064f62d18880000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000b48656c6c6f20576f726c6400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' //deployArgumentsEncoded,
    } //TODO encode proxy constructor with beacon or impl, and a separately encoded initializer call and arguments

    //console.log("Params:\n"+JSON.stringify(params));

    const request = toVerifyRequest(params);
    //console.log("Verify request:\n"+JSON.stringify(request));

    const response = await verifyContract(etherscanAPIEndpoints.urls.apiURL, request);

    console.log("Response:\n"+JSON.stringify(response));

    const pollRequest = toCheckStatusRequest({
      apiKey: etherscanAPIKey,
      guid: response.message,
    });
  
    // Compilation is bound to take some time so there's no sense in requesting status immediately.
    await delay(700);
    const verificationStatus = await getVerificationStatus(
      etherscanAPIEndpoints.urls.apiURL,
      pollRequest
    );
  
    if (
      verificationStatus.isVerificationFailure() ||
      verificationStatus.isVerificationSuccess()
    ) {
      console.log(verificationStatus.message);
    }

    //return runSuper({...args, address});
  });