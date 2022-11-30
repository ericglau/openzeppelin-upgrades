// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./RiskyLibrary.sol";

contract UnsafeContractWithLibraryCall {
    function unsafe(address target, bytes memory data) public {
        RiskyLibrary.internalDegateCall(target, data);
    }
}
