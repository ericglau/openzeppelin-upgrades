import { StorageField } from "./compare";

export function isGap(field: StorageField) : boolean {
  return field.label === '__gap' && field.type.head === 't_array';
}

export function getPositions(field: StorageField) {
  const start = parseInt(field.slot ?? "0") * 32 + (field.offset ?? 0); // TODO handle undefined slot
  const end = start + (parseInt(field.type.item.numberOfBytes ?? "0")); // TODO handle undefined numberOfBytes // fun fact numberOfBytes is aligned to the next slot if this is an array, regardless of type
  return { start, end };
}

export function endMatchesGap(original: StorageField, updated: StorageField) {
  return isGap(original) && getPositions(original).end === getPositions(updated).end;
}