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
import { Node } from 'solidity-ast/node';

const currentLayoutVersion = '1.2';

export function isCurrentLayoutVersion(layout: StorageLayout): boolean {
  return layout?.layoutVersion === currentLayoutVersion;
}

interface CompilationContext {
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

  loadNamespaces(decodeSrc, layout, namespacedContext ?? { deref, contractDef, storageLayout }, contractDef);

  return layout;
}

function loadNamespaces(
  decodeSrc: SrcDecoder,
  layout: StorageLayout,
  compilationContext: CompilationContext,
  origContractDef: ContractDefinition,
) {
  // TODO if there is a namespace annotation in source code, check if solidity version is >= 0.8.20

  const namespaces: Record<string, StorageItem[]> = {};
  for (const node of compilationContext.contractDef.nodes) {
    if (isNodeType('StructDefinition', node)) {
      const storageLocation = getNamespacedStorageLocation(node);
      if (storageLocation !== undefined) {
        namespaces[storageLocation] = getNamespacedStorageItems(
            storageLocation,
            node,
            decodeSrc,
            layout,
            compilationContext,
            origContractDef,
          );
      }
    }
  }
  layout.namespaces = namespaces;
}

export function getNamespacedStorageLocation(node: Node) {
  const doc = getDocumentation(node);
  if (hasAnnotationTag(doc, 'storage-location')) {
    return getStorageLocation(doc);
  }
}

function getNamespacedStorageItems(
  storageLocation: string,
  node: StructDefinition,
  decodeSrc: SrcDecoder,
  layout: StorageLayout,
  compilationContext: CompilationContext,
  origContractDef: ContractDefinition,
) {
  const typeMembers = getTypeMembers(node, true);
  assert(typeMembers !== undefined);

  const storageItems: StorageItem[] = [];
  for (const member of typeMembers) {
    if (typeof member !== 'string') {
      assert(member.src !== undefined);

      const contract = compilationContext.contractDef.name;
      const label = member.label;
      const type = member.type;

      const originalSource = getOriginalSource(storageLocation, node.canonicalName, member.label, origContractDef);
      if (originalSource === undefined) {
        throw new Error(
          `Could not find original source location for namespace struct with name ${node.canonicalName} and member ${member.label}`,
        );
      }

      const src = decodeSrc({ src: originalSource });

      const structMemberFromTypes = getStructMemberFromLayoutTypes(
        { ...compilationContext.storageLayout?.types },
        node.canonicalName,
        member.label,
      );

      if (structMemberFromTypes !== undefined) {
        const offset = structMemberFromTypes?.offset;
        const slot = structMemberFromTypes?.slot;
        storageItems.push({
          contract,
          label,
          type,
          src,
          offset,
          slot,
        });
      } else {
        storageItems.push({
          contract,
          label,
          type,
          src,
        });
      }

      loadLayoutType(member.typeName, layout, compilationContext.deref);
    }
  }
  return storageItems;
}

function getOriginalSource(
  storageLocation: string,
  canonicalName: string,
  memberLabel: string,
  origContractDef: ContractDefinition,
) {
  // get the same namespace struct's ast node from original source
  for (const node of origContractDef.nodes) {
    if (isNodeType('StructDefinition', node)) {
      if (node.canonicalName === canonicalName) {
        const typeMembers = getTypeMembers(node, true);
        assert(typeMembers !== undefined);

        for (const member of typeMembers) {
          if (typeof member !== 'string') {
            if (member.label === memberLabel) {
              return member.src;
            }
          }
        }
      }
      // const doc = getDocumentation(node);
      // if (hasAnnotationTag(doc, 'storage-location')) {
      //   const storageLocation = getStorageLocation(doc);
      //   namespaces[storageLocation] = getNamespacedStorageItems(node, decodeSrc, layout, compilationContext, origContractDef);
      // }
    }
  }
}

function getStructMemberFromLayoutTypes(
  namespaceTypes: Record<string, TypeItem<string>>,
  structName: string,
  memberLabel: string,
) {
  const structType = findTypeWithLabel(namespaceTypes, `struct ${structName}`);
  const structMembers = structType?.members;
  if (structMembers !== undefined) {
    for (const structMember of structMembers) {
      assert(typeof structMember !== 'string');
      if (structMember.label === memberLabel) {
        return structMember;
      }
    }
  }
  return undefined;
}

function getStorageLocation(doc: string) {
  const storageLocationArgs = getAnnotationArgs(doc, 'storage-location');
  if (storageLocationArgs.length !== 1) {
    throw new Error('@custom:storage-location annotation must have exactly one argument');
  }
  const storageLocation = storageLocationArgs[0];
  return storageLocation;
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
