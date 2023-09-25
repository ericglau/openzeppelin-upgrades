// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable-5.0/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable-5.0/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable-5.0/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable-5.0/proxy/utils/UUPSUpgradeable.sol";

contract ERC20_V2 is Initializable, ERC20Upgradeable, UUPSUpgradeable, OwnableUpgradeable {
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

    bytes32 private constant ERC20StorageLocation = 0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00;

    function _getERC20Storage2() private pure returns (ERC20Storage storage $) {
        assembly {
            $.slot := ERC20StorageLocation
        }
    }

    function resetName() public {
        ERC20Storage storage $ = _getERC20Storage2();
        $._name = 'abc';
    }
}
