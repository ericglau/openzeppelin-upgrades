// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// These contracts are for testing only. They are not safe for use in production, and do not represent best practices.

// ==== Parent contracts ====

contract Parent_NoInitializer {
  function parentFn() internal {}
}

contract Parent_InitializerModifier is Initializable {
  function parentInit() initializer public {}
}

contract Parent_ReinitializerModifier is Initializable {
  function parentReinit() reinitializer(2) public {}
}

contract Parent__OnlyInitializingModifier is Initializable {
  function __Parent_init() onlyInitializing() internal {}
}

contract Parent_InitializeName {
  function initialize() public virtual {}
}

contract Parent_InitializerName {
  function initializer() public {}
}

contract Parent_ReinitializeName {
  function reinitialize(uint64 version) public {}
}

contract Parent_ReinitializerName {
  function reinitializer(uint64 version) public {}
}

// ==== Child contracts ====

contract Child_Of_NoInitializer_Ok is Parent_NoInitializer {
  function childFn() public {}
}

contract Child_Of_InitializerModifier_Ok is Parent_InitializerModifier {
  function initialize() public {
    parentInit();
  }
}

contract Child_Of_InitializerModifier_UsesSuper_Ok is Parent_InitializerModifier {
  function initialize() public {
    super.parentInit();
  }
}

contract Child_Of_InitializerModifier_Bad is Parent_InitializerModifier {
  function initialize() public {}
}

contract Child_Of_ReinitializerModifier_Ok is Parent_ReinitializerModifier {
  function initialize() public {
    parentReinit();
  }
}

contract Child_Of_ReinitializerModifier_Bad is Parent_ReinitializerModifier {
  function initialize() public {}
}

contract Child_Of_OnlyInitializingModifier_Ok is Parent__OnlyInitializingModifier {
  function initialize() public {
    __Parent_init();
  }
}

contract Child_Of_OnlyInitializingModifier_Bad is Parent__OnlyInitializingModifier {
  function initialize() public {}
}

contract InitializerCalledFromRegularFn_Bad is Parent_InitializerModifier {
  function regularFn() public {
    parentInit();
  }
}

contract InitializerNotCalledFromInitializer_Bad is Parent_InitializerModifier {
  function initialize() public {}
}

contract InitializerCalledMultipleTimes_Bad is Parent_InitializerModifier {
  function initialize() public {
    parentInit();
    parentInit();
  }
}

contract A is Initializable {
  function __A_init() initializer internal {}
}

contract B is Initializable {
  function __B_init() initializer internal {}
}

contract C is Initializable {
  function __C_init() initializer internal {}
}

contract CorrectLinearizedInitializationOrder is A, B, C {
  function initialize() public {
    __A_init();
    __B_init();
    __C_init();
  }
}

contract IncorrectLinearizedInitializationOrder is A, B, C {
  function initialize() public {
    __A_init();
    __C_init();
    __B_init();
  }
}
