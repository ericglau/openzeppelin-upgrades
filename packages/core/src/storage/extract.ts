import assert from 'assert';
import {
  ContractDefinition,
  StructDefinition,
  EnumDefinition,
  TypeDescriptions,
  VariableDeclaration,
} from 'solidity-ast';
import { isNodeType, findAll, ASTDereferencer } from 'solidity-ast/utils';
import { StorageItem, StorageLayout, TypeItem } from './layout';
import { normalizeTypeIdentifier } from '../utils/type-id';
import { SrcDecoder } from '../src-decoder';
import { mapValues } from '../utils/map-values';
import { pick } from '../utils/pick';
import { execall } from '../utils/execall';

const currentLayoutVersion = '1.2';

export function isCurrentLayoutVersion(layout: StorageLayout): boolean {
  return layout?.layoutVersion === currentLayoutVersion;
}

export function extractStorageLayout(
  contractDef: ContractDefinition,
  decodeSrc: SrcDecoder,
  deref: ASTDereferencer,
  storageLayout?: StorageLayout | undefined,
  namespacedStorageLayout?: StorageLayout | undefined, // TODO doc
): StorageLayout {
  const layout: StorageLayout = { storage: [], types: {}, layoutVersion: currentLayoutVersion, flat: false };
  if (storageLayout !== undefined) {
    layout.types = mapValues(storageLayout.types, m => {
      return {
        label: m.label,
        members: m.members?.map(m =>
          typeof m === 'string' ? m : pick(m, ['label', 'type', 'offset', 'slot']),
        ) as TypeItem['members'],
        numberOfBytes: m.numberOfBytes,
      };
    });

    for (const storage of storageLayout.storage) {
      const origin = getOriginContract(contractDef, storage.astId, deref);
      assert(origin, `Did not find variable declaration node for '${storage.label}'`);
      const { varDecl, contract } = origin;
      const { renamedFrom, retypedFrom } = getRetypedRenamed(varDecl);
      // Solc layout doesn't bring members for enums so we get them using the ast method
      loadLayoutType(varDecl, layout, deref);
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

          loadLayoutType(varDecl, layout, deref);
        }
      }
    }
  }
  layout.namespaces = getNamespaces(contractDef, decodeSrc, namespacedStorageLayout?.types ?? layout.types);

  if (namespacedStorageLayout !== undefined) {
    // use namespaced types as the default, then write original types to it (overwriting anything if needed)
    layout.types = { ...namespacedStorageLayout.types, ...layout.types };
  }

  return layout;
}

function getNamespaces(
  contractDef: ContractDefinition,
  decodeSrc: SrcDecoder,
  types: Record<string, TypeItem>,
): Record<string, StorageItem[]> {
  const namespaces: Record<string, StorageItem[]> = {};
  for (const node of contractDef.nodes) {
    if (isNodeType('StructDefinition', node)) {
      if (node.documentation?.text.startsWith('@custom:storage-location')) {
        const key = node.documentation.text.split(' ')[1]; // TODO cleanup

        // console.log('getting namespaces for node', JSON.stringify(node,null,2));

        const typeMembers = getTypeMembers(node);
        // console.log('type members', JSON.stringify(typeMembers,null,2));

        if (typeMembers !== undefined) {
          // console.log('key', key);
          // console.log('typeMembers', typeMembers);
          const storageItems: StorageItem[] = [];
          for (const member of typeMembers) {
            if (typeof member !== 'string') {
              if (member.src === undefined) {
                throw new Error('struct member src is undefined'); // TODO handle undefined
              }

              // console.log('non-stabilized storage layout', storageLayout);
              // if (storageLayout) console.log('stabilized storage layout', JSON.stringify(stabilizeStorageLayout(storageLayout),null,2));
              // console.log('current struct canonical name', node.canonicalName);

              // console.log('member', JSON.stringify(member, null, 2));

              // console.log('getNamespaces - types', JSON.stringify(types, null, 2));

              const structType = findStructTypeWithCanonicalName(types, node.canonicalName);
              // console.log('found struct type', JSON.stringify(structType, null, 2));

              // find the same member name from the members of the struct type
              const structMembers = structType?.members;
              let storageLayoutStructMember;
              if (structMembers !== undefined) {
                for (const structMember of structMembers) {
                  if (typeof structMember === 'string') {
                    throw new Error('struct member is string'); // TODO handle string
                  } else {
                    if (structMember.label === member.label) {
                      // console.log('found struct member', JSON.stringify(structMember, null, 2));
                      storageLayoutStructMember = structMember;
                    }
                  }
                }
              }

              const storageItem: StorageItem = {
                contract: contractDef.name,
                label: member.label,
                type: member.type,
                offset: storageLayoutStructMember?.offset, // TODO if this can be undefined, create a separate storageItem object without this property
                slot: storageLayoutStructMember?.slot, // TODO same as above
                src: decodeSrc({ src: member.src }), // need to wrap object since src is never undefined
              };

              storageItems.push(storageItem);
            }
          }
          namespaces[key] = storageItems;
        }
      }
    }
  }
  // console.log('namespaces', namespaces);
  return namespaces;
}

function findStructTypeWithCanonicalName(types: Record<string, TypeItem>, canonicalName: string) {
  // iterate through storageLayout.types
  for (const type of Object.values(types)) {
    // console.log('findStructTypeWithCanonicalName - value', JSON.stringify(value, null, 2));
    // const type = storageLayout.types[key];
    // console.log('type', JSON.stringify(type, null, 2));
    if (type.label === `struct ${canonicalName}`) {
      return type;
    }
  }
  return undefined;
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

function getTypeMembers(typeDef: StructDefinition | EnumDefinition): TypeItem['members'] {
  if (typeDef.nodeType === 'StructDefinition') {
    return typeDef.members.map(m => {
      assert(typeof m.typeDescriptions.typeIdentifier === 'string');
      return {
        label: m.name,
        type: normalizeTypeIdentifier(m.typeDescriptions.typeIdentifier),
        src: m.src,
        // TODO check if we need numberOfBytes from the storage layout's types
      };
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

function loadLayoutType(varDecl: VariableDeclaration, layout: StorageLayout, deref: ASTDereferencer) {
  // Note: A UserDefinedTypeName can also refer to a ContractDefinition but we won't care about those.
  const derefUserDefinedType = deref(['StructDefinition', 'EnumDefinition', 'UserDefinedValueTypeDefinition']);

  assert(varDecl.typeName != null);

  // We will recursively look for all types involved in this variable declaration in order to store their type
  // information. We iterate over a Map that is indexed by typeIdentifier to ensure we visit each type only once.
  // Note that there can be recursive types.
  const typeNames = new Map([...findTypeNames(varDecl.typeName)].map(n => [typeDescriptions(n).typeIdentifier, n]));

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
