// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ValidateAsInitializer_PrivateNotAllowed {
  /// @custom:oz-upgrades-validate-as-initializer
  function privateInit() private {
  }
}