import 'hardhat/types/runtime';

import type { HardhatUpgrades } from '.';

declare module 'hardhat/types/runtime' {
  export interface HardhatRuntimeEnvironment {
    upgrades: HardhatUpgrades;
    platform: HardhatUpgrades;
  }
}

export interface HardhatPlatformConfig {
  apiKey: string;
  apiSecret: string;
}

declare module 'hardhat/types/config' {
  export interface HardhatUserConfig {
    platform?: HardhatPlatformConfig;
  }

  export interface HardhatConfig {
    platform?: HardhatPlatformConfig;
  }
}