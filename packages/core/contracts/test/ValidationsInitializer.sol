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

contract InitializerCalledFromRegularFn_UnsafeAllow_Fn is Parent_InitializerModifier {
  /// @custom:oz-upgrades-unsafe-allow missing-initializer
  function regularFn() public {
    parentInit();
  }
}

/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract InitializerCalledFromRegularFn_UnsafeAllow_Contract is Parent_InitializerModifier {
  function regularFn() public {
    parentInit();
  }
}

contract A is Initializable {
  function __A_init() onlyInitializing internal {}
}

contract B is Initializable {
  function __B_init() onlyInitializing internal {}
}

contract C is Initializable {
  function __C_init() onlyInitializing internal {}
}

contract InitializationOrder_Ok is A, B, C, Parent_NoInitializer {
  function initialize() public {
    __A_init();
    __B_init();
    parentFn(); // this is not an initializer so we don't check its linearization order
    __C_init();
  }
}

contract InitializationOrder_IgnoreParentWithoutInitializer_Ok is A, B, C, Parent_NoInitializer {
  function initialize() public {
    __A_init();
    __B_init();
    __C_init();
  }
}

contract InitializationOrder_WrongOrder_Bad is A, B, C, Parent_NoInitializer {
  function initialize() public {
    __A_init();
    __C_init();
    parentFn();
    __B_init();
  }
}

contract InitializationOrder_WrongOrder_UnsafeAllow is A, B, C, Parent_NoInitializer {
  /// @custom:oz-upgrades-unsafe-allow incorrect-initializer-order
  function initialize() public {
    __A_init();
    __C_init();
    parentFn();
    __B_init();
  }
}

contract InitializationOrder_MissingCall is A, B, C, Parent_NoInitializer {
  function initialize() public {
    __A_init();
    __B_init();
    parentFn();
  }
}

contract InitializationOrder_MissingCall_UnsafeAllow is A, B, C, Parent_NoInitializer {
  /// @custom:oz-upgrades-unsafe-allow missing-initializer-call
  function initialize() public {
    __A_init();
    __B_init();
    parentFn();
  }
}

contract InitializationOrder_Duplicate_Bad is A, B, C, Parent_NoInitializer {
  function initialize() public {
    __A_init();
    __B_init();
    parentFn();
    __B_init();
    __C_init();
  }
}

contract InitializationOrder_Duplicate_UnsafeAllow is A, B, C, Parent_NoInitializer {
  /// @custom:oz-upgrades-unsafe-allow duplicate-initializer-call
  function initialize() public {
    __A_init();
    __B_init();
    parentFn();
    __B_init();
    __C_init();
  }
}