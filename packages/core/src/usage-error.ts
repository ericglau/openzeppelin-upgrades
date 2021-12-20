import { EthereumProvider, getBeaconAddress, isBeaconProxy, isTransparentOrUUPSProxy, UpgradesError } from '.';

export class BeaconProxyUnsupportedError extends UpgradesError {
  constructor() {
    super(
      'Beacon proxies are not supported with the current function.',
      () => 'Use deployBeacon(), deployBeaconProxy(), or upgradeBeacon() instead.',
    );
  }
}

export class LoadProxyUnsupportedError extends UpgradesError {
  constructor(proxyAddress: string) {
    super(
      `Contract at ${proxyAddress} doesn't look like a supported proxy`,
      () => 'Only transparent, UUPS, or beacon proxies can be loaded with the loadProxy() function.',
    );
  }
}

export class PrepareUpgradeUnsupportedError extends UpgradesError {
  constructor(proxyOrBeaconAddress: string) {
    super(
      `Contract at address ${proxyOrBeaconAddress} doesn't look like a supported proxy or beacon`,
      () => `Only transparent, UUPS, or beacon proxies or beacons can be used with the prepareUpgrade() function.`,
    );
  }
}

export async function assertNotProxy(provider: EthereumProvider, address: string) {
  if (await isTransparentOrUUPSProxy(provider, address)) {
    throw new UpgradesError(
      'Address is a transparent or UUPS proxy which cannot be upgraded using upgradeBeacon().',
      () => 'Use upgradeProxy() instead.',
    );
  } else if (await isBeaconProxy(provider, address)) {
    const beaconAddress = await getBeaconAddress(provider, address);
    throw new UpgradesError(
      'Address is a beacon proxy which cannot be upgraded directly.',
      () =>
        `upgradeBeacon() must be called with a beacon address, not a beacon proxy address. Call upgradeBeacon() on the beacon address ${beaconAddress} instead.`,
    );
  }
}
