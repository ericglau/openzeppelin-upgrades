import { getAnnotationArgs } from '../utils/annotations';
import { inferUUPS } from '../validate/query';
import { SourceContract } from './validations';

interface AnnotationAssessment {
  upgradeable: boolean;
  referenceName?: string;
}

export interface UpgradeabilityAssessment {
  upgradeable: boolean;
  referenceContract?: SourceContract;
  uups?: boolean;
}

export function getUpgradeabilityAssessment(contract: SourceContract, allContracts: SourceContract[]): UpgradeabilityAssessment {
  const fullContractName = contract.fullyQualifiedName;
  const c = contract.validationData[fullContractName];
  if (c === undefined) {
    return { upgradeable: false };
  }
  const inherit = c.inherit;

  const annotationAssessment = getAnnotationAssessment(contract);
  if (annotationAssessment.upgradeable) {
    let referenceContract = undefined;
    let isReferenceUUPS = false;
    if (annotationAssessment.referenceName !== undefined) {
      referenceContract = getReferenceContract(annotationAssessment.referenceName, contract, allContracts);
      isReferenceUUPS = inferUUPS(referenceContract.validationData, referenceContract.fullyQualifiedName);
    }

    return {
      upgradeable: true,
      referenceContract: referenceContract,
      uups: isReferenceUUPS || inferUUPS(contract.validationData, fullContractName), // if reference OR current contract is UUPS, perform validations for UUPS
    };
  } else {
    const initializable = hasInitializable(inherit);
    const uups = inferUUPS(contract.validationData, fullContractName);
    return {
      upgradeable: initializable || uups,
      uups: uups, // if current contract is UUPS, perform validations for UUPS
    };
  }
}

function getReferenceContract(reference: string, origin: SourceContract, allContracts: SourceContract[]) {
  const referenceContract = allContracts.find(c => c.fullyQualifiedName === reference || c.name === reference);
  if (referenceContract !== undefined) {
    return referenceContract;
  } else {
    throw new Error(`Could not find contract ${reference} referenced in ${origin.fullyQualifiedName}.`);
  }
}

function getAnnotationAssessment(contract: SourceContract): AnnotationAssessment {
  const node = contract.node;

  if ('documentation' in node) {
    const doc = typeof node.documentation === 'string' ? node.documentation : node.documentation?.text ?? '';

    const tag = 'oz-upgrades';
    const hasUpgradeAnnotation = hasAnnotationTag(doc, tag);
    if (hasUpgradeAnnotation) {
      getAndValidateAnnotationArgs(doc, tag, contract, 0);
    }
  
    const upgradesFrom = getUpgradesFrom(doc, contract);
    if (upgradesFrom !== undefined) {
      return {
        upgradeable: true,
        referenceName: upgradesFrom,
      };
    } else {
      return {
        upgradeable: hasUpgradeAnnotation,
      };
    }
  } else {
    return {
      upgradeable: false,
    }
  }
}

function getAndValidateAnnotationArgs(doc: string, tag: string, contract: SourceContract, expectedLength: number) {
  const annotationArgs = getAnnotationArgs(doc, tag, undefined);
  if (annotationArgs.length !== expectedLength) {
    throw new Error(
      `Invalid number of arguments for @custom:${tag} annotation in contract ${contract.fullyQualifiedName}. Expected ${expectedLength}, found ${annotationArgs.length}`
    );
  }
  return annotationArgs;
}

function hasAnnotationTag(doc: string, tag: string): boolean {
  const regex = new RegExp(`^\\s*(@custom:${tag})(\\s|$)`, 'm');
  return regex.test(doc);
}

function getUpgradesFrom(doc: string, contract: SourceContract): string | undefined {
  const tag = 'oz-upgrades-from';
  if (hasAnnotationTag(doc, tag)) {
    const annotationArgs = getAndValidateAnnotationArgs(doc, tag, contract, 1);
    return annotationArgs[0];
  } else {
    return undefined;
  }
}

/**
 * Whether inherit has any contract that ends with ":Initializable"
 * @param inherit an array of fully qualified contract names
 * @return true if inherit has any contract that ends with ":Initializable"
 */
function hasInitializable(inherit: string[]) {
  return inherit.some(c => c.endsWith(':Initializable'));
}
