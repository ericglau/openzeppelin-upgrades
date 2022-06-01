import '@openzeppelin/hardhat-upgrades/dist/type-extensions';
import {
  getChainId,
  getImplementationAddress,
  isBeacon,
  isBeaconProxy,
  ValidationOptions,
  isTransparentProxy,
  isTransparentOrUUPSProxy,
} from '@openzeppelin/upgrades-core';
import { AdminClient, ProposalResponse } from 'defender-admin-client';
import type { ContractFactory, ethers } from 'ethers';
import { FormatTypes, getContractAddress } from 'ethers/lib/utils';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { fromChainId } from 'defender-base-client';
import { ProposalResponseWithUrl } from 'defender-admin-client/lib/api';

export type ProposeUpgradeFunction = (
  proxyAddress: string,
  ImplFactory: ContractFactory,
  opts?: ProposalOptions,
) => Promise<ProposalResponse>;

export interface ProposalOptions extends ValidationOptions {
  title?: string;
  description?: string;
  proxyAdmin?: string;
  multisig?: string;
  multisigType?: 'Gnosis Safe' | 'Gnosis Multisig' | 'EOA';
}

export function makeProposeUpgrade(hre: HardhatRuntimeEnvironment): ProposeUpgradeFunction {
  return async function proposeUpgrade(proxyAddress, ImplFactory, opts = {}) {
    if (!hre.config.defender) {
      throw new Error(`Missing Defender API key and secret in hardhat config`);
    }
    const client = new AdminClient(hre.config.defender);

    const chainId = await getChainId(hre.network.provider);
    const network = fromChainId(chainId);
    if (network === undefined) {
      throw new Error(`Network ${chainId} is not supported in Defender Admin`);
    }

    const { title, description, proxyAdmin, multisig, multisigType, ...moreOpts } = opts;

    if (await isBeaconProxy(hre.network.provider, proxyAddress)) {
      throw new Error(`Beacon proxy is not currently supported with defender.proposeUpgrade()`);
    } else if (await isBeacon(hre.network.provider, proxyAddress)) {
      throw new Error(`Beacon is not currently supported with defender.proposeUpgrade()`);
    } else if (
      !multisig &&
      (await isTransparentOrUUPSProxy(hre.network.provider, proxyAddress)) &&
      !(await isTransparentProxy(hre.network.provider, proxyAddress))
    ) {
      throw new Error(`Multisig address is a required property for UUPS proxies`);
    } else {
      // try getting the implementation address so that it will give an error if it's not a transparent/uups proxy
      await getImplementationAddress(hre.network.provider, proxyAddress);
    }

    const contract = { address: proxyAddress, network, abi: ImplFactory.interface.format(FormatTypes.json) as string };

    const prepareUpgradeResult = await hre.upgrades.prepareUpgrade(proxyAddress, ImplFactory, {
      getTxResponse: true,
      ...moreOpts,
    });

    if (typeof prepareUpgradeResult === 'string') {
      return clientProposeUpgrade(prepareUpgradeResult);
    } else {
      const proposalResponse: ProposalResponseWithUrlAndTx = {
        ...(await clientProposeUpgrade(getContractAddress(prepareUpgradeResult))),
        txResponse: prepareUpgradeResult,
      };
      return proposalResponse;
    }

    async function clientProposeUpgrade(newImplementation: string) {
      return client.proposeUpgrade(
        {
          newImplementation,
          title,
          description,
          proxyAdmin,
          via: multisig,
          viaType: multisigType,
        },
        contract,
      );
    }
  };
}

export interface ProposalResponseWithUrlAndTx extends ProposalResponseWithUrl {
  txResponse: ethers.providers.TransactionResponse;
}
