// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./TransitiveRiskyLibrary.sol";

contract UnsafeAllowUnreachable {
    /// @custom:oz-upgrades-unsafe-allow delegatecall
    function unsafe(address target, bytes memory data) public {
        TransitiveRiskyLibrary.internalDegateCall(target, data);
    }
}
