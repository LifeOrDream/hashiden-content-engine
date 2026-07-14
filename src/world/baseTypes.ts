import {
  getBreedForHashBeast,
  type BreedData,
} from "../prompts/breeds.prompts.js";

/** Genesis country prompts are canine-only; rebirth species use pet-content. */
export type BaseTypeId = "canine";

export const BASE_TYPE_IDS: BaseTypeId[] = ["canine"];
export const DEFAULT_BASE_TYPE: BaseTypeId = "canine";

export function getBreedForBaseType(
  _baseType: BaseTypeId,
  factionId: number,
  breedValue: number,
): BreedData {
  return getBreedForHashBeast(factionId, breedValue);
}

export function baseTypeRenderBlock(
  _baseType: BaseTypeId,
  _factionId: number,
): string {
  return "";
}
