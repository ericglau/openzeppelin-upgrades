// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ValidateAsInitializer_ArgsNotAllowed {
  uint8 x;
  /// @custom:oz-upgrades-validate-as-initializer false
  function foo() public {
    x = 1;
  }
}
