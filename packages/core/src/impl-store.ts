import debug from './utils/debug';
import { Manifest, ManifestData, ImplDeployment } from './manifest';
import { EthereumProvider, getCode, hasCode, isDevelopmentNetwork } from './provider';
import { Deployment, InvalidDeployment, resumeOrDeploy, waitAndValidateDeployment } from './deployment';
import { hashBytecode, Version } from './version';
import assert from 'assert';
import { DeployOpts } from '.';
import { exit } from 'process';

interface ManifestLens<T> {
  description: string;
  type: string;
  (data: ManifestData): ManifestField<T>;
}

interface ManifestField<T> {
  get(): T | undefined;
  set(value: T | undefined): void;
  validate?(expectedBytecode?: string, isDevNet?: boolean): T | undefined;
  import?(value: T | undefined, expectedBytecode?: string): Promise<void>;
}

/**
 * Fetches the deployment from the manifest, or deploys it if not found.
 *
 * @param lens the manifest lens
 * @param provider the Ethereum provider
 * @param deploy the deploy function
 * @param opts options containing the timeout and pollingInterval parameters. If undefined, assumes the timeout is not configurable and will not mention those parameters in the error message for TransactionMinedTimeout.
 * @param append if true, adds an address to existing deployment. Defaults to false.
 * @returns the deployment address
 * @throws {InvalidDeployment} if the deployment is invalid
 * @throws {TransactionMinedTimeout} if the transaction was not confirmed within the timeout period
 */
async function fetchOrDeployGeneric<T extends Deployment>(
  lens: ManifestLens<T>,
  provider: EthereumProvider,
  deploy: () => Promise<T>,
  opts?: DeployOpts,
  append?: boolean
): Promise<string> {
  const manifest = await Manifest.forNetwork(provider);

  try {
    const deployment = await manifest.lockedRun(async () => {
      debug('fetching deployment of', lens.description);
      const data = await manifest.read();
      const deployment = lens(data);
      let updated;
      let stored = deployment.get();
      if (stored !== undefined && deployment.validate) {
        stored = deployment.validate(await getCode(provider, stored.address), await isDevelopmentNetwork(provider));
      }
      if (append) {
        updated = await deploy();
        await checkForAddressClash(provider, data, updated);
        if (deployment.import) {
          await deployment.import(updated);
          // , async (existingAddress: string) => { 
          //   if (!await hasCode(provider, existingAddress)) {
          //     throw new InvalidDeployment(existingAddress);
          //   }
          // });
        } else {
          deployment.set(updated);
        }
        await manifest.write(data);
      } else {
        // let validatedDepl = undefined;
        // if (stored !== undefined && deployment.validate) {
        //   validatedDepl = deployment.validate(hashBytecode(await getCode(provider, stored.address)), await isDevelopmentNetwork(provider));
        // }
        if (stored === undefined) {
          debug('deployment of', lens.description, 'not found');
        }
        updated = await resumeOrDeploy(provider, stored, deploy);
        if (updated !== stored) {
          await checkForAddressClash(provider, data, updated);
          deployment.set(updated);
          await manifest.write(data);
        }
      }
      return updated;
    });

    await waitAndValidateDeployment(provider, deployment, lens.type, opts);

    return deployment.address;
  } catch (e) {
    // If we run into a deployment error, we remove it from the manifest.
    if (e instanceof InvalidDeployment) {
      await manifest.lockedRun(async () => {
        assert(e instanceof InvalidDeployment); // Not sure why this is needed but otherwise doesn't type
        const data = await manifest.read();
        const deployment = lens(data);
        const stored = deployment.get();
        if (stored?.txHash === e.deployment.txHash) {
          deployment.set(undefined);
          await manifest.write(data);
        }
      });
      e.removed = true;
    }

    throw e;
  }
}

export async function fetchOrDeploy(
  version: Version,
  provider: EthereumProvider,
  deploy: () => Promise<ImplDeployment>,
  opts?: DeployOpts,
  append?: boolean 
): Promise<string> {
  return fetchOrDeployGeneric(implLens(version.linkedWithoutMetadata), provider, deploy, opts, append);
}

export const implLens = (versionWithoutMetadata: string) =>
  lens(`implementation ${versionWithoutMetadata}`, 'implementation', data => ({
    get: () => data.impls[versionWithoutMetadata],
    set: (value?: ImplDeployment) => data.impls[versionWithoutMetadata] = value,
    validate: (existingBytecode?: string, isDevNet?: boolean) => {
      const deployment = data.impls[versionWithoutMetadata];
      if (deployment === undefined) {
        return undefined;
      }
      if (existingBytecode === undefined) {
        if (isDevNet) {
          debug('omitting a previous deployment due to no bytecode at address', deployment.address);
          return undefined;
        } else {
          throw new InvalidDeployment(deployment);
        }
      }
      const existingBytecodeHash = hashBytecode(existingBytecode);

      const storedBytecodeHash = deployment.bytecodeHash;
      console.log("GET FROM IMPL DEPLOYMENT WITH storedBytecodeHash " + storedBytecodeHash + ", COMPARING WITH " + existingBytecodeHash);
      if (storedBytecodeHash !== existingBytecodeHash) {
        if (isDevNet) {
          debug('omitting a previous deployment due to mismatched bytecode at address ', deployment.address);
          return undefined;
        } else {
          throw new InvalidDeployment(deployment);
          // TODO give a different error if the existing code was different
        }
      }
      return data.impls[versionWithoutMetadata];
    },
    import: async (value?: ImplDeployment, expectedBytecode?: string, provider?: EthereumProvider) => { 
      const existing = data.impls[versionWithoutMetadata];
      if (existing !== undefined && value !== undefined) {
        const { address, allAddresses } = await mergeAddresses(existing, value, provider);
        data.impls[versionWithoutMetadata] = { ...value, address, allAddresses };
      } else {
        data.impls[versionWithoutMetadata] = value;
      }
    }
  }));

/**
 * Merge the addresses in the deployments and return it.
 * Verifies that each existing address has code before adding it
 * 
 * @param existing existing deployment
 * @param value deployment to write
 */
async function mergeAddresses(existing: ImplDeployment, value: ImplDeployment, provider?: EthereumProvider) {
  let merged = new Set<string>();

  // TODO allow force
  if (!await checkMatchingCode(existing, existing.address, value.address, provider)) {
    // if not matching code, assume all of the other addresses in allAddresses are also invalid
    // therefore just return the new deployment as is
     console.log("NOT MATCHING CODE AT " + existing.address);
    return { address: value.address, allAddresses: value.allAddresses };
  }
  console.log("HAS MATCHING CODE AT " + existing.address);

  merged.add(existing.address);
  merged.add(value.address);
  if (existing.allAddresses !== undefined) {
    existing.allAddresses.forEach(item => merged.add(item))
  }
  if (value.allAddresses !== undefined) {
    value.allAddresses.forEach(item => merged.add(item))
  }

  return { address: existing.address, allAddresses: Array.from(merged) };
}

async function checkMatchingCode(existing: ImplDeployment, existingAddress: string, newAddress: string, provider?: EthereumProvider) {
  console.log("checkMatchingCode AT " + existing.address + " vs " + newAddress);

  if (provider !== undefined) {
    const existingCode = await getCode(provider, existingAddress);
    console.log("existingCode " + existingCode);

    const newCode = await getCode(provider, newAddress);
    console.log("newCode " + existingCode);
    if (existingCode === '0x' || existingCode !== newCode) {
      if (await isDevelopmentNetwork(provider)) {
        debug('omitting a previous deployment at address', existingAddress);
        return false;
      } else {
        throw new InvalidDeployment(existing); // TODO pass in existingAddress?
        // TODO give a different error if the existing code was different
      }
    }
  }
  return true;
}

export async function fetchOrDeployAdmin(
  provider: EthereumProvider,
  deploy: () => Promise<Deployment>,
  opts?: DeployOpts,
): Promise<string> {
  return fetchOrDeployGeneric(adminLens, provider, deploy, opts);
}

const adminLens = lens('proxy admin', 'proxy admin', data => ({
  get: () => data.admin,
  set: (value?: Deployment) => (data.admin = value),
}));

function lens<T>(description: string, type: string, fn: (data: ManifestData) => ManifestField<T>): ManifestLens<T> {
  return Object.assign(fn, { description, type });
}

async function checkForAddressClash(
  provider: EthereumProvider,
  data: ManifestData,
  updated: Deployment,
): Promise<void> {
  const clash = lookupDeployment(data, updated.address);
  if (clash !== undefined) {
    if (await isDevelopmentNetwork(provider)) {
      debug('deleting a previous deployment at address', updated.address);
      clash.set(undefined);
    } else {
      throw new Error(
        `The following deployment clashes with an existing one at ${updated.address}\n\n` +
          JSON.stringify(updated, null, 2) +
          `\n\n`,
      );
    }
  }
}

function lookupDeployment(data: ManifestData, address: string): ManifestField<Deployment> | undefined {
  if (data.admin?.address === address) {
    return adminLens(data);
  }

  for (const versionWithoutMetadata in data.impls) {
    if (data.impls[versionWithoutMetadata]?.address === address || data.impls[versionWithoutMetadata]?.allAddresses?.includes(address)) {
      return implLens(versionWithoutMetadata)(data);
    }
  }
}
