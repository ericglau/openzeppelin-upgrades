import { StorageField } from "./compare";

export function isGap(field: StorageField) : boolean {
  return field.label === '__gap' && field.type.head === 't_array';
}

export function getStartEndPos(field: StorageField) {
  const startPos = parseInt(field.slot ?? "0") * 32 + (field.offset ?? 0); // TODO handle undefined slot
  const endPos = startPos + (parseInt(field.type.item.numberOfBytes ?? "0")); // TODO handle undefined numberOfBytes // fun fact numberOfBytes is aligned to the next slot if this is an array, regardless of type
  return { startPos, endPos };
}

export function isEndAligned(updated: StorageField, original: StorageField) {
  const {endPos} = getStartEndPos(original);
  const {endPos : updatedEndPos} = getStartEndPos(updated);
  return (endPos === updatedEndPos);
}
