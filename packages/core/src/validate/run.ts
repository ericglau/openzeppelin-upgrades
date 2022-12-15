import { Node } from 'solidity-ast/node';
import { isNodeType, findAll, ASTDereferencer } from 'solidity-ast/utils';
import type { ContractDefinition, FunctionDefinition } from 'solidity-ast';

import { SolcOutput, SolcBytecode } from '../solc-api';
import { SrcDecoder } from '../src-decoder';
import { astDereferencer } from '../ast-dereferencer';
import { isNullish } from '../utils/is-nullish';
import { getFunctionSignature } from '../utils/function';
import { Version, getVersion } from '../version';
import { extractLinkReferences, LinkReference } from '../link-refs';
import { extractStorageLayout } from '../storage/extract';
import { StorageLayout } from '../storage/layout';

export type ValidationRunData = Record<string, ContractValidation>;

export interface ContractValidation {
  version?: Version;
  src: string;
  inherit: string[];
  libraries: string[];
  methods: string[];
  linkReferences: LinkReference[];
  errors: ValidationError[];
  layout: StorageLayout;
  solcVersion?: string;
}

const errorKinds = [
  'state-variable-assignment',
  'state-variable-immutable',
  'external-library-linking',
  'struct-definition',
  'enum-definition',
  'constructor',
  'delegatecall',
  'selfdestruct',
  'missing-public-upgradeto',
] as const;

export type ValidationError =
  | ValidationErrorConstructor
  | ValidationErrorOpcode
  | ValidationErrorWithName
  | ValidationErrorUpgradeability;

interface ValidationErrorBase {
  src: string;
  kind: typeof errorKinds[number];
}

interface ValidationErrorWithName extends ValidationErrorBase {
  name: string;
  kind:
    | 'state-variable-assignment'
    | 'state-variable-immutable'
    | 'external-library-linking'
    | 'struct-definition'
    | 'enum-definition';
}

interface ValidationErrorConstructor extends ValidationErrorBase {
  kind: 'constructor';
  contract: string;
}

interface ValidationErrorOpcode extends ValidationErrorBase {
  kind: 'delegatecall' | 'selfdestruct';
}

interface OpcodePattern {
  kind: 'delegatecall' | 'selfdestruct';
  pattern: RegExp;
}

export function isOpcodeError(error: ValidationErrorBase) {
  return error.kind === 'delegatecall' || error.kind === 'selfdestruct';
}

interface ValidationErrorUpgradeability extends ValidationErrorBase {
  kind: 'missing-public-upgradeto';
}

function* execall(re: RegExp, text: string) {
  re = new RegExp(re, re.flags + (re.sticky ? '' : 'y'));
  while (true) {
    const match = re.exec(text);
    if (match && match[0] !== '') {
      yield match;
    } else {
      break;
    }
  }
}

function getAllowed(node: Node, reachable: boolean): string[] {
  if ('documentation' in node) {
    const tag = `oz-upgrades-unsafe-allow${reachable ? '-reachable' : ''}`;

    const doc = typeof node.documentation === 'string' ? node.documentation : node.documentation?.text ?? '';

    const result: string[] = [];
    for (const { groups } of execall(
      /^\s*(?:@(?<title>\w+)(?::(?<tag>[a-z][a-z-]*))? )?(?<args>(?:(?!^\s@\w+)[^])*)/m,
      doc,
    )) {
      if (groups && groups.title === 'custom' && groups.tag === tag) {
        result.push(...groups.args.split(/\s+/));
      }
    }

    result.forEach(arg => {
      if (!(errorKinds as readonly string[]).includes(arg)) {
        throw new Error(`NatSpec: ${tag} argument not recognized: ${arg}`);
      }
    });

    return result;
  } else {
    return [];
  }
}

function skipCheckReachable(error: string, node: Node): boolean {
  return getAllowed(node, true).includes(error);
}

function skipCheck(error: string, node: Node): boolean {
  // skip both allow and allow-reachable errors in the lexical scope
  return [...getAllowed(node, false), ...getAllowed(node, true)].includes(error);
}

function getFullyQualifiedName(source: string, contractName: string) {
  return `${source}:${contractName}`;
}

export function validate(solcOutput: SolcOutput, decodeSrc: SrcDecoder, solcVersion?: string): ValidationRunData {
  const validation: ValidationRunData = {};
  const fromId: Record<number, string> = {};
  const inheritIds: Record<string, number[]> = {};
  const libraryIds: Record<string, number[]> = {};

  const deref = astDereferencer(solcOutput);

  for (const source in solcOutput.contracts) {
    for (const contractName in solcOutput.contracts[source]) {
      const bytecode = solcOutput.contracts[source][contractName].evm.bytecode;
      const version = bytecode.object === '' ? undefined : getVersion(bytecode.object);
      const linkReferences = extractLinkReferences(bytecode);

      validation[getFullyQualifiedName(source, contractName)] = {
        src: contractName,
        version,
        inherit: [],
        libraries: [],
        methods: [],
        linkReferences,
        errors: [],
        layout: {
          storage: [],
          types: {},
        },
        solcVersion,
      };
    }

    const allContractDefs = findAll('ContractDefinition', solcOutput.sources[source].ast);
    for (const contractDef of allContractDefs) {
      const key = getFullyQualifiedName(source, contractDef.name);

      if (key.includes("AllowReachable")) {
        const a = 1;
      }

      fromId[contractDef.id] = key;

      // May be undefined in case of duplicate contract names in Truffle
      const bytecode = solcOutput.contracts[source][contractDef.name]?.evm.bytecode;

      if (key in validation && bytecode !== undefined) {
        inheritIds[key] = contractDef.linearizedBaseContracts.slice(1);
        libraryIds[key] = getReferencedLibraryIds(contractDef);

        const opcodeErrors = [...getContractOpcodeErrors(contractDef, deref, decodeSrc, false, [])];

        validation[key].src = decodeSrc(contractDef);
        validation[key].errors = [
          ...getConstructorErrors(contractDef, decodeSrc),
          ...opcodeErrors,
          ...getStateVariableErrors(contractDef, decodeSrc),
          // TODO: add linked libraries support
          // https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/52
          ...getLinkingErrors(contractDef, bytecode),
        ];

        validation[key].layout = extractStorageLayout(
          contractDef,
          decodeSrc,
          deref,
          solcOutput.contracts[source][contractDef.name].storageLayout,
        );
        validation[key].methods = [...findAll('FunctionDefinition', contractDef)]
          .filter(fnDef => ['external', 'public'].includes(fnDef.visibility))
          .map(fnDef => getFunctionSignature(fnDef, deref));
      }
    }
  }

  for (const key in inheritIds) {
    validation[key].inherit = inheritIds[key].map(id => fromId[id]);
  }

  for (const key in libraryIds) {
    validation[key].libraries = libraryIds[key].map(id => fromId[id]);
  }

  return validation;
}

function* getConstructorErrors(contractDef: ContractDefinition, decodeSrc: SrcDecoder): Generator<ValidationError> {
  for (const fnDef of findAll('FunctionDefinition', contractDef, node => skipCheck('constructor', node))) {
    if (fnDef.kind === 'constructor' && ((fnDef.body?.statements?.length ?? 0) > 0 || fnDef.modifiers.length > 0)) {
      yield {
        kind: 'constructor',
        contract: contractDef.name,
        src: decodeSrc(fnDef),
      };
    }
  }
}

// function* getOpcodeErrors(
//   contractOrFunctionDef: ContractDefinition,
//   deref: ASTDereferencer,
//   decodeSrc: SrcDecoder,
// ): Generator<ValidationErrorOpcode> {
//   yield* getContractOpcodeErrors(
//     contractOrFunctionDef,
//     deref,
//     decodeSrc,
//     {
//       kind: 'delegatecall',
//       pattern: /^t_function_baredelegatecall_/,
//     },
//     false,
//   );
//   yield* getContractOpcodeErrors(
//     contractOrFunctionDef,
//     deref,
//     decodeSrc,
//     {
//       kind: 'selfdestruct',
//       pattern: /^t_function_selfdestruct_/,
//     },
//     false,
//   );
// }

function* getContractOpcodeErrors(
  contractDef: ContractDefinition,
  deref: ASTDereferencer,
  decodeSrc: SrcDecoder,
  skipInternal: boolean,
  cache: number[],
): Generator<ValidationErrorOpcode> {
  if (cache.includes(contractDef.id)) {
    return;
  } else {
    cache.push(contractDef.id);
  }
  yield* getFunctionOpcodeErrors(contractDef, deref, decodeSrc, skipInternal, cache);
  yield* getInheritedOpcodeErrors(contractDef, deref, decodeSrc, cache);
}

function* getFunctionOpcodeErrors(
  contractOrFunctionDef: ContractDefinition | FunctionDefinition,
  deref: ASTDereferencer,
  decodeSrc: SrcDecoder,
  skipInternal: boolean,
  cache: number[],
): Generator<ValidationErrorOpcode> {
  const parentNode = getParentNode(deref, contractOrFunctionDef);

  // get all direct errors

  if (parentNode === undefined || !skipCheck('delegatecall', parentNode)) {
    yield * getDirectOpcodeErrors(contractOrFunctionDef, decodeSrc, {
      kind: 'delegatecall',
      pattern: /^t_function_baredelegatecall_/,
    }, skipInternal);
  }  

  if (parentNode === undefined || !skipCheck('selfdestruct', parentNode)) {
    yield * getDirectOpcodeErrors(contractOrFunctionDef, decodeSrc, {
      kind: 'selfdestruct',
      pattern: /^t_function_selfdestruct_/,
    }, skipInternal);
  }

  // get all referenced errors



  for (const fnCall of findAll(
    'FunctionCall',
    contractOrFunctionDef,
    // node => skipCheckReachable(opcode.kind, node) || skipInternalFunctions(skipInternal, node),
  )) {
    const fn = fnCall.expression;
    const fnReference = (fn as any).referencedDeclaration;
    let referencedErrors = [];
    if (fnReference !== undefined && fnReference > 0) {
      const referencedNode = deref(
        ['FunctionDefinition', 'EventDefinition', 'ContractDefinition', 'StructDefinition', 'VariableDeclaration',
        'ErrorDefinition',],
        fnReference,
      );
      if (referencedNode.nodeType === 'FunctionDefinition' && !cache.includes(referencedNode.id)) {
        cache.push(referencedNode.id);
        referencedErrors.push(...getFunctionOpcodeErrors(referencedNode, deref, decodeSrc, false, cache));
      } // else ignore the other listed node types
    }

    for (const error of referencedErrors) {
      if (error.kind === 'delegatecall' && !skipCheckReachable('delegatecall', fnCall) && !skipCheckReachable('delegatecall', contractOrFunctionDef) && (parentNode === undefined || !skipCheckReachable('delegatecall', parentNode))) {
        yield error;
      }
      if (error.kind === 'selfdestruct' && !skipCheckReachable('selfdestruct', fnCall) && !skipCheckReachable('selfdestruct', contractOrFunctionDef) && (parentNode === undefined || !skipCheckReachable('selfdestruct', parentNode))) {
        yield error;
      }
    }
  }

  // for (const error of referencedErrors) {
  //   if (error.kind === 'delegatecall' && !skipCheckReachable('delegatecall', contractOrFunctionDef) && (parentNode === undefined || !skipCheckReachable('delegatecall', parentNode))) {
  //     yield error;
  //   }
  //   if (error.kind === 'selfdestruct' && !skipCheckReachable('selfdestruct', contractOrFunctionDef) && (parentNode === undefined || !skipCheckReachable('selfdestruct', parentNode))) {
  //     yield error;
  //   }
  // }


  // remove allowed errors

  // if (parentNode === undefined || !skipCheck(opcode.kind, parentNode)) {
  //   yield* getDirectFunctionOpcodeErrors(contractOrFunctionDef, decodeSrc, opcode, skipInternal);
  // }
  // if (parentNode === undefined || !skipCheckReachable(opcode.kind, parentNode)) {
  //   yield* getReferencedFunctionOpcodeErrors(contractOrFunctionDef, deref, decodeSrc, opcode, skipInternal);
  // }
}

function* getDirectOpcodeErrors(
  contractOrFunctionDef: ContractDefinition | FunctionDefinition,
  decodeSrc: SrcDecoder,
  opcode: OpcodePattern,
  skipInternal: boolean,
) {
  for (const fnCall of findAll(
    'FunctionCall',
    contractOrFunctionDef,
    node => skipCheck(opcode.kind, node) || skipInternalFunctions(skipInternal, node),
  )) {
    const fn = fnCall.expression;
    if (fn.typeDescriptions.typeIdentifier?.match(opcode.pattern)) {
      yield {
        kind: opcode.kind,
        src: decodeSrc(fnCall),
      };
    }
  }
}

// function* getReferencedOpcodeErrors(
//   contractOrFunctionDef: ContractDefinition | FunctionDefinition,
//   deref: ASTDereferencer,
//   decodeSrc: SrcDecoder,
//   // opcode: OpcodePattern,
//   // skipInternal: boolean,
// ) {
//   for (const fnCall of findAll(
//     'FunctionCall',
//     contractOrFunctionDef,
//     // node => skipCheckReachable(opcode.kind, node) || skipInternalFunctions(skipInternal, node),
//   )) {
//     const fn = fnCall.expression;
//     const fnReference = (fn as any).referencedDeclaration;
//     if (fnReference !== undefined && fnReference > 0) {
//       const referencedNode = deref(
//         ['FunctionDefinition', 'EventDefinition', 'ContractDefinition', 'StructDefinition'],
//         fnReference,
//       );
//       if (referencedNode.nodeType === 'FunctionDefinition') {
//         yield* getFunctionOpcodeErrors(referencedNode, deref, decodeSrc, false);
//       } // else ignore the other listed node types
//     }
//   }
// }

function* getInheritedOpcodeErrors(
  contractDef: ContractDefinition,
  deref: ASTDereferencer,
  decodeSrc: SrcDecoder,
  cache: number[],
) {
  const errors = [];
  // if (!skipCheckReachable(opcode.kind, contractDef)) {
    for (const base of contractDef.baseContracts) {
      const referencedContract = deref('ContractDefinition', base.baseName.referencedDeclaration);
      errors.push(...getContractOpcodeErrors(referencedContract, deref, decodeSrc, true, cache));
    }

  for (const error of errors) {
    if (error.kind === 'delegatecall' && !skipCheckReachable('delegatecall', contractDef)) {
      yield error;
    }
    if (error.kind === 'selfdestruct' && !skipCheckReachable('selfdestruct', contractDef)) {
      yield error;
    }
  }
  // }
}

function getParentNode(deref: ASTDereferencer, contractOrFunctionDef: ContractDefinition | FunctionDefinition) {
  const parentNode = deref(['ContractDefinition', 'SourceUnit'], contractOrFunctionDef.scope);
  if (parentNode.nodeType === 'ContractDefinition') {
    return parentNode;
  } // else ignore the other listed node types
}

function skipInternalFunctions(skipInternal: boolean, node: Node) {
  return (
    skipInternal &&
    node.nodeType === 'FunctionDefinition' &&
    (node.visibility === 'internal' || node.visibility === 'private')
  );
}

function* getStateVariableErrors(
  contractDef: ContractDefinition,
  decodeSrc: SrcDecoder,
): Generator<ValidationErrorWithName> {
  for (const varDecl of contractDef.nodes) {
    if (isNodeType('VariableDeclaration', varDecl)) {
      if (!varDecl.constant && !isNullish(varDecl.value)) {
        if (!skipCheck('state-variable-assignment', contractDef) && !skipCheck('state-variable-assignment', varDecl)) {
          yield {
            kind: 'state-variable-assignment',
            name: varDecl.name,
            src: decodeSrc(varDecl),
          };
        }
      }
      if (varDecl.mutability === 'immutable') {
        if (!skipCheck('state-variable-immutable', contractDef) && !skipCheck('state-variable-immutable', varDecl)) {
          yield {
            kind: 'state-variable-immutable',
            name: varDecl.name,
            src: decodeSrc(varDecl),
          };
        }
      }
    }
  }
}

function getReferencedLibraryIds(contractDef: ContractDefinition): number[] {
  const implicitUsage = [...findAll('UsingForDirective', contractDef)]
    .map(usingForDirective => {
      if (usingForDirective.libraryName !== undefined) {
        return usingForDirective.libraryName.referencedDeclaration;
      } else if (usingForDirective.functionList !== undefined) {
        return [];
      } else {
        throw new Error(
          'Broken invariant: either UsingForDirective.libraryName or UsingForDirective.functionList should be defined',
        );
      }
    })
    .flat();

  const explicitUsage = [...findAll('Identifier', contractDef)]
    .filter(identifier => identifier.typeDescriptions.typeString?.match(/^type\(library/))
    .map(identifier => {
      if (isNullish(identifier.referencedDeclaration)) {
        throw new Error('Broken invariant: Identifier.referencedDeclaration should not be null');
      }
      return identifier.referencedDeclaration;
    });

  return [...new Set(implicitUsage.concat(explicitUsage))];
}

function* getLinkingErrors(
  contractDef: ContractDefinition,
  bytecode: SolcBytecode,
): Generator<ValidationErrorWithName> {
  const { linkReferences } = bytecode;
  for (const source of Object.keys(linkReferences)) {
    for (const libName of Object.keys(linkReferences[source])) {
      if (!skipCheck('external-library-linking', contractDef)) {
        yield {
          kind: 'external-library-linking',
          name: libName,
          src: source,
        };
      }
    }
  }
}
