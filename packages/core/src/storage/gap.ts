import { StorageField } from "./compare";

/**
 * Returns true if the field represents a storage gap.
 * 
 * @param field the storage field
 * @returns true if field is a gap, otherwise false
 */
export function isGap(field: StorageField) : boolean {
  return field.label === '__gap' && field.type.head === 't_array';
}

/**
 * Gets the storage field's begin position.
 * 
 * @param field the storage field
 * @returns the begin position, or NaN if the slot or offset is undefined
 */
export function storageFieldBegin(field: StorageField): number {
  return Number(field.slot) * 32 + Number(field.offset);
}

/**
 * Gets the storage field's end position.
 * 
 * @param field the storage field
 * @returns the end position, or NaN if the slot or offset or number of bytes is undefined
 */
export function storageFieldEnd(field: StorageField): number {
  return storageFieldBegin(field) + Number(field.type.item.numberOfBytes);
}

/**
 * Returns true if original storage field is a gap and the updated storage field
 * ends at the exact same position as the gap.
 * 
 * @param original the original storage field
 * @param updated the updated storage field
 * @returns true if original is a gap and original and updated end at the same position, otherwise false
 */
export function endMatchesGap(original: StorageField, updated: StorageField) {
  return isGap(original) && storageFieldEnd(original) === storageFieldEnd(updated);
}