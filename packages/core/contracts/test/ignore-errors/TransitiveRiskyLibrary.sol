// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./RiskyLibrary.sol";

library TransitiveRiskyLibrary {
    function isContract(address account) internal view returns (bool) {
        return RiskyLibrary.isContract(account);
    }

    function internalDegateCall(
        address target,
        bytes memory data
    ) internal returns (bytes memory) {
        return RiskyLibrary.internalDegateCall(target, data);
    }
}