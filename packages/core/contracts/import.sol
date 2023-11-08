// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v5/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts-v5/proxy/beacon/UpgradeableBeacon.sol";
import "@openzeppelin/contracts-v5/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts-v5/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts-v5/proxy/transparent/ProxyAdmin.sol";

// Kept for backwards compatibility with older versions of Hardhat and Truffle plugins.
contract AdminUpgradeabilityProxy is TransparentUpgradeableProxy {
    constructor(address logic, address admin, bytes memory data) payable TransparentUpgradeableProxy(logic, admin, data) {}
}
