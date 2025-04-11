// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface AbstractVirtualParent {
  /// @custom:oz-upgrades-validate-as-initializer
  function virtualInit() external;
}

abstract contract A is AbstractVirtualParent {
  uint x;
  function virtualInit() public {
    x = 1;
  }
}

contract ValidateAsInitializer_AbstractNotAllowed is A {

}
