// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Base {
    /// @custom:storage-location erc7201:example.a
    struct MainStorage {
        uint128 x;
        uint128 y;
    }
}
