// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable-5.0/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable-5.0/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable-5.0/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable-5.0/proxy/utils/UUPSUpgradeable.sol";

contract ERC20_V1 is Initializable, ERC20Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() initializer public {
        __ERC20_init("MyToken", "MTK");
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyOwner
        override
    {}
}
