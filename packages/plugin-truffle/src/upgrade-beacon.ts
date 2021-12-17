import {
  ContractAddressOrInstance,
  ContractClass,
  ContractInstance,
  deploy,
  deployBeaconImpl,
  getContractAddress,
  getUpgradeableBeaconFactory,
  Options,
  withDefaults,
} from './utils';

export async function upgradeBeacon(beacon: ContractAddressOrInstance, Contract: ContractClass, opts: Options = {}): Promise<ContractInstance> {
  const beaconAddress = getContractAddress(beacon);
  const { impl: nextImpl } = await deployBeaconImpl(Contract, opts);

  const UpgradeableBeaconFactory = getUpgradeableBeaconFactory(Contract);
// TODO just copy from Contract
  const beaconContract = new UpgradeableBeaconFactory(beaconAddress);
//  UpgradeableBeaconFactory.detectNetwork();
//  UpgradeableBeaconFactory.address = beaconAddress;
//  const beaconContract = await UpgradeableBeaconFactory.deployed();
  await beaconContract.upgradeTo(nextImpl);
  
  //Contract.address = beaconAddress;
  
  //const beaconContract = new Contract(beaconDeployment.address);
  //beaconContract.transactionHash = beaconDeployment.txHash;
  
  //return new Contract(beaconAddress);
  return beaconContract;
}
