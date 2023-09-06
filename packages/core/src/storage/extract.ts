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
import { StorageItem, StorageLayout, TypeItem } from './layout';
import { normalizeTypeIdentifier } from '../utils/type-id';
import { SrcDecoder } from '../src-decoder';
import { mapValues } from '../utils/map-values';
import { pick } from '../utils/pick';
import { execall } from '../utils/execall';
import { getAnnotationArgs, getDocumentation, hasAnnotationTag } from '../utils/annotations';

const currentLayoutVersion = '1.2';

export function isCurrentLayoutVersion(layout: StorageLayout): boolean {
  return layout?.layoutVersion === currentLayoutVersion;
}

export function extractStorageLayout(
  contractDef: ContractDefinition,
  decodeSrc: SrcDecoder,
  deref: ASTDereferencer,
  storageLayout?: StorageLayout | undefined,
  // TODO make these combined into a single object
  namespacedContractDef?: ContractDefinition | undefined, // TODO doc
  namespacedStorageLayout?: StorageLayout | undefined, // TODO doc
): StorageLayout {
  const layout: StorageLayout = { storage: [], types: {}, layoutVersion: currentLayoutVersion, flat: false };

  const combinedTypes = { ...namespacedStorageLayout?.types, ...storageLayout?.types };

  // const combinedTypes = combineStructTypes(storageLayout?.types, namespacedStorageLayout?.types);
  // layout.types = mapValues(combinedTypes, m => {
  //   return {
  //     label: m.label,
  //     members: m.members?.map(m =>
  //       typeof m === 'string' ? m : pick(m, ['label', 'type', 'offset', 'slot']),
  //     ) as TypeItem['members'],
  //     numberOfBytes: m.numberOfBytes,
  //   };
  // });
  
  if (storageLayout !== undefined) {
    layout.types = mapValues( combinedTypes, m => {
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

  // // TODO for each type in layout, get the same type from namespacedStorageLayout.types and add it to layout.types but include offset and slot
  // for (const type of Object.values(layout.types)) {
  //   const namespacedType = findTypeWithLabel(namespacedStorageLayout?.types, type.label);
  //   if (namespacedType !== undefined) {
  //     type.members = namespacedType.members;
  //   }
  // }


  loadLayoutNamespaces(namespacedContractDef ?? contractDef, decodeSrc, layout, deref, { ...namespacedStorageLayout?.types });

  rectifyNamespacedTypes(layout, { ...namespacedStorageLayout?.types });

  return layout;
}

function rectifyNamespacedTypes(layout: StorageLayout, namespacedTypes: Record<string, TypeItem>) {
  // const types = layout.types;
  // // get all types that have the same label
  // const labels = Object.values(types).map(t => t.label);
  // const uniqueLabels = [...new Set(labels)];
  // for (const label of uniqueLabels) {
  //   const typesWithLabel = Object.values(types).filter(t => t.label === label);
  //   if (typesWithLabel.length > 1) {
  //     // get the type that has slot and offset
  //     const typeWithSlotAndOffset = typesWithLabel.find(t => t.slot !== undefined && t.offset !== undefined);

  // for each namespaced type, if it has the same label as a type in layout.types, overwrite the type in layout.types with the namespaced type
  for (const namespacedType of Object.values(namespacedTypes)) {
    const origKeys = Object.keys(layout.types);

    for (const key of origKeys) {      
      if (layout.types[key].label === namespacedType.label) {
        layout.types[key] = namespacedType;
      }
    }
  }
}

// /**
//  * Combine struct types that have the same struct name in their labels (but using the original storage layout's identifiers)
//  */
// function combineStructTypes(storageLayoutTypes?: Record<string, TypeItem>, namespacedStorageLayoutTypes?: Record<string, TypeItem>): Record<string, TypeItem> {
//   if (!storageLayoutTypes) {
//     return { ...namespacedStorageLayoutTypes };
//   } else if (!namespacedStorageLayoutTypes) {
//     return { ...storageLayoutTypes };
//   }

//   const combinedTypes: Record<string, TypeItem> = { ...storageLayoutTypes };

//   for (const typeId of Object.keys(storageLayoutTypes)) {
//     console.log('checking typeid ' + typeId);
//     const type = storageLayoutTypes[typeId];
//     const namespacedType = findTypeWithLabel(namespacedStorageLayoutTypes, type.label);
//     if (namespacedType !== undefined) {
//       combinedTypes[typeId] = { ...namespacedType, ...type };
//       console.log('using combined type: ' + JSON.stringify(combinedTypes[typeId], null, 2));
//     }
//   }
//   return combinedTypes;
// }

function loadLayoutNamespaces(
  contractDef: ContractDefinition,
  decodeSrc: SrcDecoder,
  layout: StorageLayout,
  deref: ASTDereferencer,
  namespaceTypes: Record<string, TypeItem>,
) {
  // TODO if there is a namespace annotation in source code, check if solidity version is >= 0.8.20

  const namespaces: Record<string, StorageItem[]> = {};
  for (const node of contractDef.nodes) {
    if (isNodeType('StructDefinition', node)) {
      const doc = getDocumentation(node);
      if (hasAnnotationTag(doc, 'storage-location')) {
        const storageLocation = getStorageLocation(doc);
        namespaces[storageLocation] = getNamespacedStorageItems(
          node,
          contractDef,
          decodeSrc,
          layout,
          deref,
          namespaceTypes,
        );
      }
    }
  }
  layout.namespaces = namespaces;
}

function getNamespacedStorageItems(
  node: StructDefinition,
  contractDef: ContractDefinition,
  decodeSrc: SrcDecoder,
  layout: StorageLayout,
  deref: ASTDereferencer,
  namespaceTypes: Record<string, TypeItem<string>>,
) {
  const typeMembers = getTypeMembers(node, true);
  assert(typeMembers !== undefined);

  const storageItems: StorageItem[] = [];
  for (const member of typeMembers) {
    if (typeof member !== 'string') {
      assert(member.src !== undefined);

      const structType = findStructTypeWithCanonicalName(namespaceTypes, node.canonicalName);

      console.log('got structType ' + JSON.stringify(structType, null, 2));

      // find the same member name from the members of the struct type
      const structMembers = structType?.members;
      let structMemberFromTypes;
      if (structMembers !== undefined) {
        for (const structMember of structMembers) {
          assert(typeof structMember !== 'string');
          if (structMember.label === member.label) {
            structMemberFromTypes = structMember;
          }
        }
      }

      const contract = contractDef.name;
      const label = member.label;
      const type = member.type;
      const offset = structMemberFromTypes?.offset;
      const slot = structMemberFromTypes?.slot;
      const src = decodeSrc({ src: member.src });

      const storageItem: StorageItem =
        offset !== undefined && slot !== undefined
          ? {
              contract,
              label,
              type,
              src,
              offset,
              slot,
            }
          : {
              contract,
              label,
              type,
              src,
            };
      storageItems.push(storageItem);

      loadLayoutType(member.typeName, layout, deref);
    }
  }
  return storageItems;
}

function getStorageLocation(doc: string) {
  const storageLocationArgs = getAnnotationArgs(doc, 'storage-location');
  if (storageLocationArgs.length !== 1) {
    throw new Error('@custom:storage-location annotation must have exactly one argument');
  }
  const storageLocation = storageLocationArgs[0];
  return storageLocation;
}

function findStructTypeWithCanonicalName(types: Record<string, TypeItem>, canonicalName: string) {
  return findTypeWithLabel(types, `struct ${canonicalName}`);
}

function findTypeWithLabel(types: Record<string, TypeItem>, label: string) {
  for (const type of Object.values(types)) {
    if (type.label === label) {
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

function getTypeMembers(typeDef: StructDefinition | EnumDefinition, includeTypeName?: boolean): TypeItem['members'] {
  if (typeDef.nodeType === 'StructDefinition') {
    return typeDef.members.map(m => {
      assert(typeof m.typeDescriptions.typeIdentifier === 'string');

      if (includeTypeName) {
        // TODO remove this duplicate
        return {
          label: m.name,
          type: normalizeTypeIdentifier(m.typeDescriptions.typeIdentifier),
          src: m.src,
          typeName: m.typeName, // TODO remove this from here, but get typeName in getNamespacedStorageItems
          // TODO check if we need numberOfBytes from the storage layout's types
        };
      } else {
        return {
          label: m.name,
          type: normalizeTypeIdentifier(m.typeDescriptions.typeIdentifier),
          src: m.src,
        };
      }


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

function loadLayoutType(typeName: TypeName | null | undefined, layout: StorageLayout, deref: ASTDereferencer) {
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
