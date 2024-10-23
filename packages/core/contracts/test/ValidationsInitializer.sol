// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract NoInitializer {
  function foo() public {
  }
}

contract HasInitializerModifier is Initializable {
  function foo() initializer public {}
}

contract HasReinitializerModifier is Initializable {
  function foo() reinitializer(2) public {}
}

contract HasOnlyInitializingModifier is Initializable {
  function foo() onlyInitializing() internal {}
}

contract HasInitializeName {
  function initialize() public {}
}

contract HasInitializerName {
  function initializer() public {}
}

contract HasReinitializeName {
  function reinitialize(uint64 version) public {}
}

contract HasReinitializerName {
  function reinitializer(uint64 version) public {}
}

contract CallsParentInitializer is HasInitializerModifier {
  function foo2() initializer public {
    foo();
  }
}

contract CallsParentInitializerUsingSuper is HasInitializerModifier {
  function foo2() initializer public {
    super.foo();
  }
}

contract NotCallsParentInitializer is HasInitializerModifier {
  function foo2() initializer public {}
}