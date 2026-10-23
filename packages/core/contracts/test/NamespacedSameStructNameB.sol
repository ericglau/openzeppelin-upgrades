// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Base {
    /// @custom:storage-location erc7201:example.b
    struct MainStorage {
        uint256 x;
        uint256 y;
    }
}
