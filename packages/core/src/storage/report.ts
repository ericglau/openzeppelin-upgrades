import _chalk from 'chalk';

import type { BasicOperation } from '../levenshtein';
import type { ParsedTypeDetailed } from './layout';
import { StorageOperation, StorageItem, StorageField, TypeChange, EnumOperation, LayoutChange, storageFieldEnd, storageFieldBegin } from './compare';
import { itemize, itemizeWith } from '../utils/itemize';
import { indent } from '../utils/indent';
import { assert } from '../utils/assert';
import { isGap } from './gap';

export class LayoutCompatibilityReport {
  constructor(readonly ops: StorageOperation<StorageItem>[]) {}

  get ok(): boolean {
    return this.pass;
  }

  get pass(): boolean {
    return this.ops.length === 0;
  }

  explain(color = true): string {
    const chalk = new _chalk.Instance({ level: color && _chalk.supportsColor ? _chalk.supportsColor.level : 0 });
    const res = [];

    for (const [i, op] of this.ops.entries()) {
      const src = 'updated' in op ? op.updated.src : op.original.contract;
      // Only print layoutchange if it's the first op, otherwise we assume it will be explained by previous ops.
      if (op.kind === 'layoutchange' && i !== 0) {
        continue;
      }
      res.push(
        chalk.bold(src) + ':' + indent(explainStorageOperation(op, { kind: 'layout', allowAppend: true }), 2, 1),
      );
    }

    return res.join('\n\n');
  }
}

interface StorageOperationContext {
  kind: 'struct' | 'layout';
  allowAppend: boolean;
}

function explainStorageOperation(op: StorageOperation<StorageField>, ctx: StorageOperationContext): string {
  switch (op.kind) {
    case 'shrinkgap':
    case 'typechange': {
      const basic = explainTypeChange(op.change, op.original, op.updated);
      const details =
        ctx.kind === 'layout' // explain details for layout only
          ? new Set(
              getAllTypeChanges(op.change)
                .map(explainTypeChangeDetails)
                .filter((d?: string): d is string => d !== undefined),
            )
          : [];
      return `Upgraded ${label(op.updated)} to an incompatible type\n` + itemize(basic, ...details);
    }

    case 'finishgap':
      return `Converted end of storage gap ${label(op.original)} to ${label(op.updated)}`;

    case 'rename':
      return `Renamed ${label(op.original)} to ${label(op.updated)}`;

    case 'replace':
      return `Replaced ${label(op.original)} with ${label(op.updated)} of incompatible type`;

    case 'layoutchange': {
      let expectedSize;
      if (isGap(op.original)){

        let log = '';

    
        // 1. get original field end
        const origStart = storageFieldBegin(op.original);
        log += ' origStart=' + origStart;
        const origEnd = storageFieldEnd(op.original);
        log += ' origEnd=' + origEnd;
      
        const numberOfBytes = op.original.type.item.numberOfBytes;
        let bytesPerItem;
        if (numberOfBytes !== undefined && op.original.type.tail) {
          const originalSize = parseInt(op.original.type.tail, 10);
          bytesPerItem = parseInt(numberOfBytes) / originalSize;
          log += ' bytesPerItem=' + bytesPerItem;
        }
      
        // 2. get new field start
        const updatedStart = storageFieldBegin(op.updated);
        log += ' updatedStart=' + updatedStart;
      
        // 3. calculate expected field size to reach original field end
        if (origEnd !== undefined && updatedStart !== undefined) {
          const expectedSizeBytes = origEnd - updatedStart; 
          log += ' expectedSizeBytes=' + expectedSizeBytes;
  
          if (bytesPerItem !== undefined) {
            expectedSize = expectedSizeBytes / BigInt(bytesPerItem); 
            log += ' expectedSize=' + expectedSize; 
          }
        }

      }


      return (
        `Layout ${op.change.uncertain ? 'could have changed' : 'changed'} for ${label(op.updated)} ` +
        `(${op.original.type.item.label} -> ${op.updated.type.item.label})\n` +
        describeLayoutTransition(op.change) + ` expected size: ${expectedSize}`
      ).trimEnd();
    }

    default: {
      const title = explainBasicOperation(op, t => t.label);
      const hints = [];

      switch (op.kind) {
        case 'insert': {
          if (ctx.kind === 'struct') {
            if (ctx.allowAppend) {
              hints.push('New struct members should be placed after existing ones');
            } else {
              hints.push('New struct members are not allowed here. Define a new struct');
            }
          } else {
            hints.push('New variables should be placed after all existing inherited variables');
          }
          break;
        }

        case 'delete': {
          hints.push('Keep the variable even if unused');
          break;
        }
      }

      return title + '\n' + itemizeWith('>', ...hints);
    }
  }
}

function explainTypeChange(ch: TypeChange, original: StorageField, updated: StorageField): string {
  switch (ch.kind) {
    case 'visibility change':
      return `Bad upgrade ${describeTransition(ch.original, ch.updated)}\nDifferent visibility`;

    case 'obvious mismatch':
    case 'struct members':
    case 'enum members':
      return `Bad upgrade ${describeTransition(ch.original, ch.updated)}`;

    case 'enum resize':
      return `Bad upgrade ${describeTransition(ch.original, ch.updated)}\nDifferent representation sizes`;

    case 'mapping key':
      return `In key of ${ch.updated.item.label}\n` + itemize(explainTypeChange(ch.inner, original, updated));

    case 'mapping value':
    case 'array value':
      return `In ${ch.updated.item.label}\n` + itemize(explainTypeChange(ch.inner, original, updated));

    case 'array shrink':
    case 'array grow': {
      assert(ch.original.tail && ch.updated.tail);
      const originalSize = parseInt(ch.original.tail, 10);
      const updatedSize = parseInt(ch.updated.tail, 10);


      if (isGap(original)) {


        let log = '';
        let expectedSize;
    
        // 1. get original field end
        const origStart = storageFieldBegin(original);
        log += ' origStart=' + origStart;
        const origEnd = storageFieldEnd(original);
        log += ' origEnd=' + origEnd;
      
        const numberOfBytes = original.type.item.numberOfBytes;
        let bytesPerItem;
        if (numberOfBytes !== undefined) {
          bytesPerItem = parseInt(numberOfBytes) / originalSize;
          log += ' bytesPerItem=' + bytesPerItem;
        }
      
        // 2. get new field start
        const updatedStart = storageFieldBegin(updated);
        log += ' updatedStart=' + updatedStart;
      
        // 3. calculate expected field size to reach original field end
        if (origEnd !== undefined && updatedStart !== undefined) {
          const expectedSizeBytes = origEnd - updatedStart; 
          log += ' expectedSizeBytes=' + expectedSizeBytes;
  
          if (bytesPerItem !== undefined) {
            expectedSize = expectedSizeBytes / BigInt(bytesPerItem); 
            log += ' expectedSize=' + expectedSize; 
          }
        }
        
        //  updated.type.item.
  
  


        const note =
          ch.kind === 'array shrink'
            ? `Expected gap resize to ${expectedSize}`
            : 'Size cannot increase here';
        return `Bad storage gap resize from ${originalSize} to ${updatedSize}\n${note}`;
      } else {
        const note = ch.kind === 'array shrink' ? 'Size cannot decrease' : 'Size cannot increase here';
        return `Bad array resize from ${originalSize} to ${updatedSize}\n${note}`;
      }
    }

    case 'array dynamic': {
      assert(ch.original.tail && ch.updated.tail);
      const [originalSize, updatedSize] = ch.original.tail === 'dyn' ? ['dynamic', 'fixed'] : ['fixed', 'dynamic'];
      return `Bad upgrade from ${originalSize} to ${updatedSize} size array`;
    }

    case 'missing members': {
      const type = ch.updated.head.replace(/^t_/, ''); // t_struct, t_enum -> struct, enum
      return `Insufficient data to compare ${type}s\nManually assess compatibility, then use option \`unsafeAllowCustomTypes: true\``;
    }

    case 'unknown':
      return `Unknown type ${ch.updated.item.label}`;
  }
}

// function getExpectedSize(original: StorageField, updated: StorageField) {
//   let log = '';

//   // 1. get original field end
//   const origEnd = storageFieldEnd(original);
//   log += 'origEnd=' + origEnd;

//   const originalSize = parseInt(ch.original.tail, 10);
//   const origItemSize = origEnd / 

//   // 2. get new field start
//   const updatedStart = storageFieldBegin(updated);
//   log += 'updatedStart=' + updatedStart;

//   // 3. calculate expected field size to reach original field end
//   if (origEnd !== undefined && updatedStart !== undefined) {
//     const expectedSize = origEnd - updatedStart; 
//     log += 'expectedSize=' + expectedSize;
//   }

// //  updated.type.item.
// }

function getAllTypeChanges(root: TypeChange): TypeChange[] {
  const list = [root];

  for (const ch of list) {
    switch (ch.kind) {
      case 'mapping value':
      case 'array value':
        list.push(ch.inner);
        break;

      case 'struct members': {
        for (const op of ch.ops) {
          if (op.kind === 'typechange') {
            list.push(op.change);
          }
        }
        break;
      }

      // We mention all other kinds explicitly to review any future new kinds
      case 'obvious mismatch':
      case 'enum members':
      case 'enum resize':
      case 'mapping key':
      case 'array shrink':
      case 'array grow':
      case 'array dynamic':
      case 'missing members':
      case 'unknown':
        break;
    }
  }

  return list;
}

function explainTypeChangeDetails(ch: TypeChange): string | undefined {
  switch (ch.kind) {
    case 'struct members': {
      const { allowAppend } = ch;
      return (
        `In ${ch.updated.item.label}\n` +
        itemize(
          ...ch.ops.flatMap((op, i) => {
            if (op.kind === 'layoutchange' && i !== 0) {
              // Only print layoutchange if it's the first op, otherwise we assume it will be explained by previous ops.
              return [];
            } else {
              return [explainStorageOperation(op, { kind: 'struct', allowAppend })];
            }
          }),
        )
      );
    }

    case 'enum members':
      return `In ${ch.updated.item.label}\n` + itemize(...ch.ops.map(explainEnumOperation));
  }
}

function explainEnumOperation(op: EnumOperation): string {
  switch (op.kind) {
    case 'replace':
      return `Replaced \`${op.original}\` with \`${op.updated}\``;

    default:
      return explainBasicOperation(op, t => t);
  }
}

function explainBasicOperation<T>(op: BasicOperation<T>, getName: (t: T) => string): string {
  switch (op.kind) {
    case 'delete':
      return `Deleted \`${getName(op.original)}\``;

    case 'insert':
      return `Inserted \`${getName(op.updated)}\``;

    case 'append':
      return `Added \`${getName(op.updated)}\``;
  }
}

function describeTransition(original: ParsedTypeDetailed, updated: ParsedTypeDetailed): string {
  const originalLabel = original.item.label;
  const updatedLabel = updated.item.label;

  if (originalLabel === updatedLabel) {
    return `to ${updatedLabel}`;
  } else {
    return `from ${originalLabel} to ${updatedLabel}`;
  }
}

function describeLayoutTransition(change: LayoutChange): string {
  const res = [];
  for (const k of ['slot', 'offset', 'bytes'] as const) {
    const ch = change[k];
    if (ch) {
      const label = (k === 'bytes' ? 'number of bytes' : k).replace(/^./, c => c.toUpperCase());
      res.push(`${label} changed from ${ch.from} to ${ch.to}`);
    }
  }
  return itemize(...res);
}

function label(variable: { label: string }): string {
  return '`' + variable.label + '`';
}
