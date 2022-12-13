// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./RiskyLibrary.sol";

/**
 * @custom:oz-upgrades-unsafe-allow-reachable delegatecall
 */
contract TransitiveAllowReachable {
      function internalDelegateCall(
        bytes memory data
    ) external returns (bytes memory) {
        return RiskyLibrary.internalDelegateCall(address(this), data);
    }
}