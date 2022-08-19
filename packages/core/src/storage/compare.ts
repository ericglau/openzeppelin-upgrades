import { levenshtein, Operation } from '../levenshtein';
import { hasLayout, ParsedTypeDetailed, isEnumMembers, isStructMembers } from './layout';
import { UpgradesError } from '../error';
import { StorageItem as _StorageItem, StructMember as _StructMember, StorageField as _StorageField } from './layout';
import { LayoutCompatibilityReport } from './report';
import { assert } from '../utils/assert';
import { isValueType } from '../utils/is-value-type';

export type StorageItem = _StorageItem<ParsedTypeDetailed>;
type StructMember = _StructMember<ParsedTypeDetailed>;

export type StorageField = _StorageField<ParsedTypeDetailed>;
export type StorageOperation<F extends StorageField> = Operation<F, StorageFieldChange<F>>;

export type EnumOperation = Operation<string, { kind: 'replace'; original: string; updated: string }>;

type StorageFieldChange<F extends StorageField> = (
  | { kind: 'replace' | 'rename' | 'replacegap' }
  | { kind: 'typechange'; change: TypeChange }
  | { kind: 'layoutchange'; change: LayoutChange }
  | { kind: 'gaplayoutchange'; change: LayoutChange }
  | { kind: 'shrinkgap'; change: TypeChange }
) & {
  original: F;
  updated: F;
};

export type TypeChange = (
  | {
      kind:
        | 'obvious mismatch'
        | 'unknown'
        | 'array grow'
        | 'visibility change'
        | 'array shrink'
        | 'array dynamic'
        | 'enum resize'
        | 'missing members';
    }
  | {
      kind: 'mapping key' | 'mapping value' | 'array value';
      inner: TypeChange;
    }
  | {
      kind: 'enum members';
      ops: EnumOperation[];
    }
  | {
      kind: 'struct members';
      ops: StorageOperation<StructMember>[];
      allowAppend: boolean;
    }
) & {
  original: ParsedTypeDetailed;
  updated: ParsedTypeDetailed;
};

export interface LayoutChange {
  uncertain?: boolean;
  slot?: Record<'from' | 'to', string>;
  offset?: Record<'from' | 'to', number>;
  bytes?: Record<'from' | 'to', string>;
}

export class StorageLayoutComparator {
  hasAllowedUncheckedCustomTypes = false;

  // Holds a stack of type comparisons to detect recursion
  stack = new Set<string>();
  cache = new Map<string, TypeChange | undefined>();

  constructor(readonly unsafeAllowCustomTypes = false, readonly unsafeAllowRenames = false) {}

  compareLayouts(original: StorageItem[], updated: StorageItem[]): LayoutCompatibilityReport {
    const leven = this.layoutLevenshtein(original, updated, { allowAppend: true });

    const report = new LayoutCompatibilityReport(leven);
    return report;
  }

  private layoutLevenshtein<F extends StorageField>(
    original: F[],
    updated: F[],
    { allowAppend }: { allowAppend: boolean },
  ): StorageOperation<F>[] {
    let ops = levenshtein(original, updated, (a, b) => this.getFieldChange(a, b));

    console.log("Levenshtein ops: " + JSON.stringify(ops, null, 2));

    // const opsFilteredGaps = [];
    // for (let i = 0; i < ops.length; i++) {
    //   if (ops[i].kind = 'insert') {
    //     for (let j = 0; j < ops.length; j++) {
    //       const compare = ops[j];
    //       if (j !== i && compare.kind === 'shrinkgap') {

    //         //const TEMP = compare.change.original;
    //         // TODO check if compare.original overlaps 
    //       } // TODO or if gap was deleted
    //       else {
    //         opsFilteredGaps.push(ops);
    //       }
    //     }
    //   }
    // }
  
    // filter append
    if (allowAppend) {
      ops = ops.filter(o => o.kind !== 'append');
    }

    return ops.filter(o => {
      if (o.kind === 'insert') {
        console.log("INSERTED " + JSON.stringify(o.updated, null, 2));
        // TODO if the inserted item overlaps with a gap or overlaps with nothing, return false;
        // else:

        const { startPos, endPos } = getStartEndPos(o.updated);
        console.log("insert - startPos " + startPos + " endPos " + endPos);


        // An insertion is allowed if it lies completely within an original gap that was shrunk,
        // or (it does not overlap with a non-gap in the original layout AND the next field in the original and updated layouts retain the same slot)

        for (let i = 0; i < ops.length; i++) {
          const op = ops[i];
          if (op.kind === 'shrinkgap' || op.kind === 'gaplayoutchange') {
            console.log("comparing insert to gap");

            const { startPos : gapStartPos, endPos : gapEndPos } = getStartEndPos(op.original);
            console.log("comparing with gap - startPos " + startPos + " endPos " + endPos);

            if (startPos >= gapStartPos && endPos <= gapEndPos /* TODO add condition to allow this to expand past the end of the original storage */) {
              console.log("insert is within gap, omitting");
              return false;
            }
          }
        }

        // for (let i = 0; i < original.length; i++) {
        //   const compare = original[i];
        //   console.log("comparing insert to field " + compare.label);

        //   const { startPos : compareStart, endPos : compareEnd } = getStartEndPos(compare);
        //   console.log("comparing with field's: compareStart " + compareStart + " compareEnd " + compareEnd);

        //   // for non-gaps, if the insertion overlaps with the original field, this is not allowed (return true) 
        //   // https://stackoverflow.com/questions/325933/determine-whether-two-date-ranges-overlap
        //   // (StartDate1 <= EndDate2) and (StartDate2 <= EndDate1)
        //   // else it is fine (return false)
        //   if (compare.label !== '__gap' && (compareStart <= endPos && startPos <= compareEnd)) { /* TODO add condition to allow this to expand past the end of the original storage */
        //     console.log("field " + o.updated.label + " overlaps with " + compare.label);
        //     return true;
        //   } else {
        //     // console.log("field " + o.updated.label + " does not overlap. checking next item...");
        //     // if (i < original.length - 1) {
        //     //   const next = original[i+1];
        //     //   if ()
        //     // }
        //    return false;
        //   }
        // }
        console.log("determined that the insert is unsafe");
        return true;
      } else if (o.kind === 'shrinkgap') {
        console.log("SHRANK GAP " + JSON.stringify(o, null, 2));

        const { startPos, endPos } = getStartEndPos(o.original);
        console.log("gap - startPos " + startPos + " endPos " + endPos);

        const { startPos : updatedStartPos, endPos : updatedEndPos } = getStartEndPos(o.updated);
        console.log("gap - updatedStartPos " + updatedStartPos + " updatedEndPos " + updatedEndPos);

        if (endPos === updatedEndPos) { // the gap ends match, so they are compatible
          return false;
        } else {
          return true;
        }

        // TODO if the inserted item overlaps with a gap or overlaps with nothing, return false;

      } else if (o.kind === 'replacegap') {
        console.log("REPLACE GAP " + JSON.stringify(o, null, 2));

        // if a gap was replaced by something else <ENDS AT THE SAME SPOT AS THE GAP?> (TODO test if the replacement is smaller or larger than the gap), then it is fine
        const { startPos, endPos } = getStartEndPos(o.original);
        console.log("gap - startPos " + startPos + " endPos " + endPos);

        const { startPos : updatedStartPos, endPos : updatedEndPos } = getStartEndPos(o.updated);
        console.log("replacement - updatedStartPos " + updatedStartPos + " updatedEndPos " + updatedEndPos);

        // // if the original gap was the last item, allow it (as long as the starting point was the same?)
        // // 1. find label from original
        // for (let i = 0; i < original.length; i++) {
        //   console.log("looping " + i);
        //   if (original[i].label === o.original.label) {
        //     console.log("labels match " + original[i].label);

        //     // 2. see if the index is the last one, or if there are consecutive end gaps
        //     if (i === original.length - 1) {
        //       console.log("it is the last index " + i);
        //       return false;
        //     } else {
        //       console.log("it is NOT the last index " + i + " out of length " + original.length);
        //     }
        //   }
        // }

        if (endPos === updatedEndPos) {
          return false;
        } else {
          return true;
        }

      } else {
        // TODO if a shrinkgap ends on the same slot as before, return false (allow it), else return true

       // console.log("ALLOW " + JSON.stringify(o, null, 2));
        return true;
      }
    });
  }

  getVisibilityChange(original: ParsedTypeDetailed, updated: ParsedTypeDetailed): TypeChange | undefined {
    const re = /^t_function_(internal|external)/;
    const originalVisibility = original.head.match(re);
    const updatedVisibility = updated.head.match(re);
    assert(originalVisibility && updatedVisibility);
    if (originalVisibility[0] !== updatedVisibility[0]) {
      return { kind: 'visibility change', original, updated };
    }
  }

  getFieldChange<F extends StorageField>(original: F, updated: F): StorageFieldChange<F> | undefined {
    const nameChange =
      !this.unsafeAllowRenames &&
      original.label !== updated.renamedFrom &&
      (updated.label !== original.label ||
        (updated.renamedFrom !== undefined && updated.renamedFrom !== original.renamedFrom));
    const retypedFromOriginal = original.type.item.label === updated.retypedFrom?.trim();
    const typeChange = !retypedFromOriginal && this.getTypeChange(original.type, updated.type, { allowAppend: false });
    const layoutChange = this.getLayoutChange(original, updated);

    if (updated.retypedFrom && layoutChange) {
      return { kind: 'layoutchange', original, updated, change: layoutChange };
    } else if (typeChange && nameChange) {
      if (original.label === '__gap') {
        const {endPos} = getStartEndPos(original);
        const {endPos : updatedEndPos} = getStartEndPos(updated);
        if (endPos === updatedEndPos) {
          console.log("Found replace gap with matching ends");
          return { kind: 'replacegap', original, updated };
        } else {
          console.log("Found replace gap but ends do NOT match");
        }
      }
      return { kind: 'replace', original, updated };
    } else if (nameChange) {
      return { kind: 'rename', original, updated };
    } else if (typeChange) {
      if (typeChange.kind === 'array shrink' && updated.label === '__gap') {
        return { kind: 'shrinkgap', change: typeChange, original, updated };
      } else {
        return { kind: 'typechange', change: typeChange, original, updated };
      }
    } else if (layoutChange && !layoutChange.uncertain) {
      if (original.label === '__gap') {
        return { kind: 'gaplayoutchange', original, updated, change: layoutChange };
      }

      // Any layout change should be caught earlier as a type change, but we
      // add this check as a safety fallback.
      return { kind: 'layoutchange', original, updated, change: layoutChange };
    }
  }

  getLayoutChange(original: StorageField, updated: StorageField): LayoutChange | undefined {
    const validPair = ['uint8', 'bool'];
    const knownCompatibleTypes =
      validPair.includes(original.type.item.label) && validPair.includes(updated.type.item.label);
    if (knownCompatibleTypes) {
      return undefined;
    } else if (hasLayout(original) && hasLayout(updated)) {
      const change = <T>(from: T, to: T) => (from === to ? undefined : { from, to });
      const slot = change(original.slot, updated.slot);
      const offset = change(original.offset, updated.offset);
      const bytes = change(original.type.item.numberOfBytes, updated.type.item.numberOfBytes);
      if (slot || offset || bytes) {
        return { slot, offset, bytes };
      }
    } else {
      return { uncertain: true };
    }
  }

  getTypeChange(
    original: ParsedTypeDetailed,
    updated: ParsedTypeDetailed,
    { allowAppend }: { allowAppend: boolean },
  ): TypeChange | undefined {
    const key = JSON.stringify({ original: original.id, updated: updated.id, allowAppend });
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    if (this.stack.has(key)) {
      throw new UpgradesError(`Recursive types are not supported`, () => `Recursion found in ${updated.item.label}\n`);
    }

    try {
      this.stack.add(key);
      const result = this.uncachedGetTypeChange(original, updated, { allowAppend });
      this.cache.set(key, result);
      return result;
    } finally {
      this.stack.delete(key);
    }
  }

  private uncachedGetTypeChange(
    original: ParsedTypeDetailed,
    updated: ParsedTypeDetailed,
    { allowAppend }: { allowAppend: boolean },
  ): TypeChange | undefined {
    if (updated.head.startsWith('t_function')) {
      return this.getVisibilityChange(original, updated);
    }

    if (original.head !== updated.head) {
      return { kind: 'obvious mismatch', original, updated };
    }

    if (original.args === undefined || updated.args === undefined) {
      // both should be undefined at the same time
      assert(original.args === updated.args);
      return undefined;
    }

    switch (original.head) {
      case 't_contract':
        // no storage layout errors can be introduced here since it is just an address
        return undefined;

      case 't_struct': {
        const originalMembers = original.item.members;
        const updatedMembers = updated.item.members;
        if (originalMembers === undefined || updatedMembers === undefined) {
          if (this.unsafeAllowCustomTypes) {
            this.hasAllowedUncheckedCustomTypes = true;
            return undefined;
          } else {
            return { kind: 'missing members', original, updated };
          }
        }
        assert(isStructMembers(originalMembers) && isStructMembers(updatedMembers));
        const ops = this.layoutLevenshtein(originalMembers, updatedMembers, { allowAppend });
        if (ops.length > 0) {
          return { kind: 'struct members', ops, original, updated, allowAppend };
        } else {
          return undefined;
        }
      }

      case 't_enum': {
        const originalMembers = original.item.members;
        const updatedMembers = updated.item.members;
        if (originalMembers === undefined || updatedMembers === undefined) {
          if (this.unsafeAllowCustomTypes) {
            this.hasAllowedUncheckedCustomTypes = true;
            return undefined;
          } else {
            return { kind: 'missing members', original, updated };
          }
        }
        assert(isEnumMembers(originalMembers) && isEnumMembers(updatedMembers));
        if (enumSize(originalMembers.length) !== enumSize(updatedMembers.length)) {
          return { kind: 'enum resize', original, updated };
        } else {
          const ops = levenshtein(originalMembers, updatedMembers, (a, b) =>
            a === b ? undefined : { kind: 'replace' as const, original: a, updated: b },
          ).filter(o => o.kind !== 'append');
          if (ops.length > 0) {
            return { kind: 'enum members', ops, original, updated };
          } else {
            return undefined;
          }
        }
      }

      case 't_mapping': {
        const [originalKey, originalValue] = original.args;
        const [updatedKey, updatedValue] = updated.args;

        // validate an invariant we assume from solidity: key types are always simple value types
        assert(isValueType(originalKey) && isValueType(updatedKey));

        // network files migrated from the OZ CLI have an unknown key type
        // we allow it to match with any other key type, carrying over the semantics of OZ CLI
        const keyChange =
          originalKey.head === 'unknown'
            ? undefined
            : this.getTypeChange(originalKey, updatedKey, { allowAppend: false });

        if (keyChange) {
          return { kind: 'mapping key', inner: keyChange, original, updated };
        } else {
          // mapping value types are allowed to grow
          const inner = this.getTypeChange(originalValue, updatedValue, { allowAppend: true });
          if (inner) {
            return { kind: 'mapping value', inner, original, updated };
          } else {
            return undefined;
          }
        }
      }

      case 't_array': {
        const originalLength = original.tail?.match(/^(\d+|dyn)/)?.[0];
        const updatedLength = updated.tail?.match(/^(\d+|dyn)/)?.[0];
        assert(originalLength !== undefined && updatedLength !== undefined);

        if (originalLength === 'dyn' || updatedLength === 'dyn') {
          if (originalLength !== updatedLength) {
            return { kind: 'array dynamic', original, updated };
          }
        }

        const originalLengthInt = parseInt(originalLength, 10);
        const updatedLengthInt = parseInt(updatedLength, 10);

        if (updatedLengthInt < originalLengthInt) {
          return { kind: 'array shrink', original, updated };
        } else if (!allowAppend && updatedLengthInt > originalLengthInt) {
          return { kind: 'array grow', original, updated };
        }

        const inner = this.getTypeChange(original.args[0], updated.args[0], { allowAppend: false });

        if (inner) {
          return { kind: 'array value', inner, original, updated };
        } else {
          return undefined;
        }
      }

      default:
        return { kind: 'unknown', original, updated };
    }
  }
}

function getStartEndPos(field: StorageField) {

  const startPos = parseInt(field.slot ?? "0") * 32 + (field.offset ?? 0); // TODO handle undefined slot
  const endPos = startPos + (parseInt(field.type.item.numberOfBytes ?? "0")); // TODO handle undefined numberOfBytes // fun fact numberOfBytes is aligned to the next slot if this is an array, regardless of type
  return { startPos, endPos };
}

function enumSize(memberCount: number): number {
  return Math.ceil(Math.log2(Math.max(2, memberCount)) / 8);
}
