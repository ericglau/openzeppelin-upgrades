// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./RiskyParentContract.sol";

contract UnsafeContractWithParentCall is RiskyParentContract {
    function unsafe(address target, bytes memory data) public {
        internalDegateCall(target, data);
    }
}
