// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./TransitiveRiskyLibrary.sol";

contract UnsafeAllowReachable {
    /// @custom:oz-upgrades-unsafe-allow-reachable delegatecall
    function unsafe(bytes memory data) public {
        TransitiveRiskyLibrary.internalDegateCall(address(this), data);
    }
}
