// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Base as BaseA} from "./NamespacedSameStructNameA.sol";
import {Base as BaseB} from "./NamespacedSameStructNameB.sol";

// The storage of each contract has two different structs named `Base.MainStorage`: the inherited namespace, and the
// type of a member in another namespace

contract UsesA is BaseA {
    /// @custom:storage-location erc7201:example.usesA
    struct OtherStorage {
        BaseB.MainStorage other;
    }
}

contract UsesB is BaseB {
    /// @custom:storage-location erc7201:example.usesB
    struct OtherStorage {
        BaseA.MainStorage other;
    }
}
