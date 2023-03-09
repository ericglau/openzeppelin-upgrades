import {
  DeployOpts,
  ProxyKindOption,
  StandaloneValidationOptions,
  ValidationOptions,
  withValidationDefaults,
} from '@openzeppelin/upgrades-core';

export type StandaloneOptions = StandaloneValidationOptions &
  DeployOpts & {
    constructorArgs?: unknown[];
    useDeployedImplementation?: boolean;
  };

export type UpgradeOptions = ValidationOptions & StandaloneOptions;

export function withDefaults(opts: UpgradeOptions = {}): Required<UpgradeOptions> {
  return {
    constructorArgs: opts.constructorArgs ?? [],
    timeout: opts.timeout ?? 60e3,
    pollingInterval: opts.pollingInterval ?? 5e3,
    useDeployedImplementation: opts.useDeployedImplementation ?? true,
    ...withValidationDefaults(opts),
  };
}

export type GetTxResponse = {
  getTxResponse?: boolean;
};

type Initializer = {
  initializer?: string | false;
};

export type PlatformOptions = {
  platform?: boolean;
  verifySourceCode?: boolean;
}

export type DeployBeaconProxyOptions = ProxyKindOption & Initializer & PlatformOptions;
export type DeployBeaconOptions = StandaloneOptions & PlatformOptions;
export type DeployImplementationOptions = StandaloneOptions & GetTxResponse & PlatformOptions;
export type DeployContractOptions = StandaloneOptions & GetTxResponse & PlatformOptions;
export type DeployProxyAdminOptions = DeployOpts & PlatformOptions;
export type DeployProxyOptions = StandaloneOptions & Initializer & PlatformOptions;
export type ForceImportOptions = ProxyKindOption;
export type PrepareUpgradeOptions = UpgradeOptions & GetTxResponse & PlatformOptions;
export type UpgradeBeaconOptions = UpgradeOptions;
export type UpgradeProxyOptions = UpgradeOptions & {
  call?: { fn: string; args?: unknown[] } | string;
};
export type ValidateImplementationOptions = StandaloneValidationOptions;
export type ValidateUpgradeOptions = ValidationOptions;
