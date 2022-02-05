import { UpgradesError } from "./error";
import { ProxyDeployment } from "./manifest";
import { EthereumProvider, getCode } from "./provider";
import { logWarning } from "./utils/log";

/**
 * Determines whether runtime bytecode at an address matches with contract creation code.
 *  
 * @param provider the Ethereum provider
 * @param addr the address to get the runtime bytecode from
 * @param creationCode the creation code that may have deployed the contract
 * @returns true if the creation code contains the runtime code
 */
export async function isBytecodeMatch(provider: EthereumProvider, addr: string, creationCode: string) {
  const implBytecode = await getCode(provider, addr);
  return compareBytecode(creationCode, implBytecode);
}

function compareBytecode(creationCode: string, deployedBytecode: string) {
  const creationCodeWithoutPrefix = creationCode.replace(/^0x/, '');
  const deployedBytecodeWithoutPrefix = deployedBytecode.replace(/^0x/, '');
  return creationCodeWithoutPrefix.includes(deployedBytecodeWithoutPrefix);
}

interface ProxyCreationCodes {
  UUPSProxy: string,
  TransparentProxy: string,
  BeaconProxy: string
}

/**
 * Determines the kind of proxy at an address by comparing its runtime bytecode with some possible proxy creation codes.
 * 
 * @param provider the Ethereum provider
 * @param proxyAddress the proxy address
 * @param proxyCreationCodes possible proxy creation codes
 * @param kind proxy kind option specified by the user. Will only be used if the kind cannot be determined from the runtime bytecode.
 * @returns 
 */
export async function detectProxyKindFromBytecode(provider: EthereumProvider, proxyAddress: string, proxyCreationCodes: ProxyCreationCodes, kind?: string) {
  let importKind: ProxyDeployment["kind"];
  if (await isBytecodeMatch(provider, proxyAddress, proxyCreationCodes.UUPSProxy)) {
    importKind = 'uups';
  } else if (await isBytecodeMatch(provider, proxyAddress, proxyCreationCodes.TransparentProxy)) {
    importKind = 'transparent';
  } else if (await isBytecodeMatch(provider, proxyAddress, proxyCreationCodes.BeaconProxy)) {
    importKind = 'beacon';
  } else {
    if (kind === undefined) {
      throw new UpgradesError(`Cannot determine the proxy kind at address ${proxyAddress}. Specify the 'kind' option for the importProxy function.`);
    } else {
      if (kind !== 'uups' && kind !== 'transparent' && kind !== 'beacon') {
        throw new UpgradesError(`kind must be uups, transparent, or beacon`, () => `Specify a supported kind of proxy in the options for the importProxy function`);
      }
      importKind = kind;
    }
  }

  if (kind !== undefined && kind !== importKind) {
    logWarning(`Detected proxy kind '${importKind}' at address ${proxyAddress} which differs from specified kind '${kind}'`, [
      `The kind of proxy detected at the given address differs from the kind specified in the importProxy function's options.`,
      `The proxy will be imported as kind '${importKind}'.`,
    ]);
  }
  return importKind;
}
