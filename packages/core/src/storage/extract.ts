import assert from 'assert';
import {
  ContractDefinition,
  StructDefinition,
  EnumDefinition,
  TypeDescriptions,
  VariableDeclaration,
  TypeName,
} from 'solidity-ast';
import { isNodeType, findAll, ASTDereferencer } from 'solidity-ast/utils';
import { StorageLayout, StructMember, TypeItem } from './layout';
import { normalizeTypeIdentifier } from '../utils/type-id';
import { SrcDecoder } from '../src-decoder';
import { mapValues } from '../utils/map-values';
import { pick } from '../utils/pick';
import { execall } from '../utils/execall';
import { loadNamespaces } from './namespace';

const currentLayoutVersion = '1.2';

export function isCurrentLayoutVersion(layout: StorageLayout): boolean {
  return layout?.layoutVersion === currentLayoutVersion;
}

export interface CompilationContext {
  deref: ASTDereferencer;
  contractDef: ContractDefinition;
  storageLayout?: StorageLayout;
}

export function extractStorageLayout(
  contractDef: ContractDefinition,
  decodeSrc: SrcDecoder,
  deref: ASTDereferencer,
  storageLayout?: StorageLayout,
  namespacedContext?: CompilationContext,
): StorageLayout {
  const layout: StorageLayout = { storage: [], types: {}, layoutVersion: currentLayoutVersion, flat: false };

  layout.types = mapValues({ ...namespacedContext?.storageLayout?.types, ...storageLayout?.types }, m => {
    return {
      label: m.label,
      members: m.members?.map(m =>
        typeof m === 'string' ? m : pick(m, ['label', 'type', 'offset', 'slot']),
      ) as TypeItem['members'],
      numberOfBytes: m.numberOfBytes,
    };
  });

  if (storageLayout !== undefined) {
    for (const storage of storageLayout.storage) {
      const origin = getOriginContract(contractDef, storage.astId, deref);
      assert(origin, `Did not find variable declaration node for '${storage.label}'`);
      const { varDecl, contract } = origin;
      const { renamedFrom, retypedFrom } = getRetypedRenamed(varDecl);
      // Solc layout doesn't bring members for enums so we get them using the ast method
      loadLayoutType(varDecl.typeName, layout, deref);
      const { label, offset, slot, type } = storage;
      const src = decodeSrc(varDecl);
      layout.storage.push({ label, offset, slot, type, contract, src, retypedFrom, renamedFrom });
      layout.flat = true;
    }
  } else {
    for (const varDecl of contractDef.nodes) {
      if (isNodeType('VariableDeclaration', varDecl)) {
        if (!varDecl.constant && varDecl.mutability !== 'immutable') {
          const type = normalizeTypeIdentifier(typeDescriptions(varDecl).typeIdentifier);
          const { renamedFrom, retypedFrom } = getRetypedRenamed(varDecl);
          layout.storage.push({
            contract: contractDef.name,
            label: varDecl.name,
            type,
            src: decodeSrc(varDecl),
            retypedFrom,
            renamedFrom,
          });

          loadLayoutType(varDecl.typeName, layout, deref);
        }
      }
    }
  }

  const context = namespacedContext ?? { deref, contractDef, storageLayout };
  loadNamespaces(decodeSrc, layout, context, contractDef);

  return layout;
}

const findTypeNames = findAll([
  'ArrayTypeName',
  'ElementaryTypeName',
  'FunctionTypeName',
  'Mapping',
  'UserDefinedTypeName',
]);

interface RequiredTypeDescriptions {
  typeIdentifier: string;
  typeString: string;
}

function typeDescriptions(x: { typeDescriptions: TypeDescriptions }): RequiredTypeDescriptions {
  assert(typeof x.typeDescriptions.typeIdentifier === 'string');
  assert(typeof x.typeDescriptions.typeString === 'string');
  return x.typeDescriptions as RequiredTypeDescriptions;
}

export function getTypeMembers(
  typeDef: StructDefinition | EnumDefinition,
  includeTypeName?: boolean,
): TypeItem['members'] {
  if (typeDef.nodeType === 'StructDefinition') {
    return typeDef.members.map(m => {
      assert(typeof m.typeDescriptions.typeIdentifier === 'string');
      let fields: StructMember = {
        label: m.name,
        type: normalizeTypeIdentifier(m.typeDescriptions.typeIdentifier),
        src: m.src,
      };
      if (includeTypeName && m.typeName) {
        fields = { ...fields, typeName: m.typeName };
      }
      return fields;
    });
  } else {
    return typeDef.members.map(m => m.name);
  }
}

function getOriginContract(contract: ContractDefinition, astId: number | undefined, deref: ASTDereferencer) {
  for (const id of contract.linearizedBaseContracts) {
    const parentContract = deref(['ContractDefinition'], id);
    const varDecl = parentContract.nodes.find(n => n.id == astId);
    if (varDecl && isNodeType('VariableDeclaration', varDecl)) {
      return { varDecl, contract: parentContract.name };
    }
  }
}

export function loadLayoutType(typeName: TypeName | null | undefined, layout: StorageLayout, deref: ASTDereferencer) {
  // Note: A UserDefinedTypeName can also refer to a ContractDefinition but we won't care about those.
  const derefUserDefinedType = deref(['StructDefinition', 'EnumDefinition', 'UserDefinedValueTypeDefinition']);

  assert(typeName != null);

  // We will recursively look for all types involved in this variable declaration in order to store their type
  // information. We iterate over a Map that is indexed by typeIdentifier to ensure we visit each type only once.
  // Note that there can be recursive types.
  const typeNames = new Map([...findTypeNames(typeName)].map(n => [typeDescriptions(n).typeIdentifier, n]));

  for (const typeName of typeNames.values()) {
    const { typeIdentifier, typeString: label } = typeDescriptions(typeName);
    const type = normalizeTypeIdentifier(typeIdentifier);
    layout.types[type] ??= { label };

    if ('referencedDeclaration' in typeName && !/^t_contract\b/.test(type)) {
      const typeDef = derefUserDefinedType(typeName.referencedDeclaration);

      if (typeDef.nodeType === 'UserDefinedValueTypeDefinition') {
        layout.types[type].underlying = typeDef.underlyingType.typeDescriptions.typeIdentifier ?? undefined;
      } else {
        layout.types[type].members ??= getTypeMembers(typeDef);
      }

      // Recursively look for the types referenced in this definition and add them to the queue.
      for (const typeName of findTypeNames(typeDef)) {
        const { typeIdentifier } = typeDescriptions(typeName);
        if (!typeNames.has(typeIdentifier)) {
          typeNames.set(typeIdentifier, typeName);
        }
      }
    }
  }
}

function getRetypedRenamed(varDecl: VariableDeclaration) {
  let retypedFrom, renamedFrom;
  if ('documentation' in varDecl) {
    const docs = typeof varDecl.documentation === 'string' ? varDecl.documentation : varDecl.documentation?.text ?? '';
    for (const { groups } of execall(
      /^\s*(?:@(?<title>\w+)(?::(?<tag>[a-z][a-z-]*))? )?(?<args>(?:(?!^\s@\w+)[^])*)/m,
      docs,
    )) {
      if (groups?.title === 'custom') {
        if (groups.tag === 'oz-retyped-from') {
          retypedFrom = groups.args.trim();
        } else if (groups.tag === 'oz-renamed-from') {
          renamedFrom = groups.args.trim();
        }
      }
    }
  }
  return { retypedFrom, renamedFrom };
}
