import { EthereumProvider, getCode } from "./provider";

export async function isBytecodeMatch(provider: EthereumProvider, addr: string, creationCode: string) {
  const implBytecode = await getCode(provider, addr);
  return compareBytecode(creationCode, implBytecode);
}

function compareBytecode(creationCode: string, deployedBytecode: string) {
  const creationCodeWithoutPrefix = creationCode.replace(/^0x/, '');
  const deployedBytecodeWithoutPrefix = deployedBytecode.replace(/^0x/, '');
  return creationCodeWithoutPrefix.includes(deployedBytecodeWithoutPrefix);
}