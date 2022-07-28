import { DeployOpts, ProxyKindOption, StandaloneValidationOptions, ValidationOptions, withValidationDefaults } from '@openzeppelin/upgrades-core';

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
}

type Initializer = {
  initializer?: string | false;
}

export interface DeployBeaconProxyOptions extends ProxyKindOption, Initializer {}

export interface DeployBeaconOptions extends StandaloneOptions {}

export interface DeployImplementationOptions extends StandaloneOptions, GetTxResponse {}

export interface DeployProxyAdminOptions extends DeployOpts {}

export interface DeployProxyOptions extends StandaloneOptions, Initializer {}

export interface ForceImportOptions extends ProxyKindOption {}

export interface PrepareUpgradeOptions extends UpgradeOptions, GetTxResponse {}

export interface UpgradeBeaconOptions extends UpgradeOptions {}

export interface UpgradeProxyOptions extends UpgradeOptions {
  call?: { fn: string; args?: unknown[] } | string;
}

export interface ValidateImplementationOptions extends StandaloneValidationOptions {}

export interface ValidateUpgradeOptions extends ValidationOptions {}