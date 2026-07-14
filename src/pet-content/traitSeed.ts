const FACTION_BITS = 4;
const ASCENSION_BITS = 3;
const APPEARANCE_TRAIT_BITS = 5;
const POWER_TRAIT_BITS = 4;
const APPEARANCE_GROUPS = 7;
const POWER_GROUPS = 5;
const TRAITS_PER_GROUP = 3;
const APPEARANCE_OFFSET = FACTION_BITS + ASCENSION_BITS;
const APPEARANCE_TOTAL_BITS =
  APPEARANCE_GROUPS * TRAITS_PER_GROUP * APPEARANCE_TRAIT_BITS;
const POWER_OFFSET = APPEARANCE_OFFSET + APPEARANCE_TOTAL_BITS;
const BREED_OFFSET = 172;
const PRESTIGE_OFFSET = 174;

export interface DecodedMintTraitSeed {
  faction: number;
  ascension: number;
  type: number;
  profession: number;
  breed: number;
  prestige_count: number;
  appearance: [number, number, number][];
  powers: [number, number, number][];
}

export function normalizeTraitSeedHex(value: unknown): string {
  const clean = String(value || "").replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error("origin.trait_seed must be 32-byte hex");
  }
  return clean;
}

function bytesFromHex(value: string): Uint8Array {
  return new Uint8Array(
    value.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)),
  );
}

function traitValue(
  bytes: Uint8Array,
  offset: number,
  bitsPerTrait: number,
  traitIndex: number,
): number {
  const startBit = offset + traitIndex * bitsPerTrait;
  let value = 0;
  for (let index = 0; index < bitsPerTrait; index += 1) {
    const bit = startBit + index;
    value |= ((bytes[Math.floor(bit / 8)] >> (bit % 8)) & 1) << index;
  }
  return value;
}

function groups(
  bytes: Uint8Array,
  offset: number,
  count: number,
  bits: number,
): [number, number, number][] {
  return Array.from({ length: count }, (_, group) => {
    const base = group * TRAITS_PER_GROUP;
    return [
      traitValue(bytes, offset, bits, base),
      traitValue(bytes, offset, bits, base + 1),
      traitValue(bytes, offset, bits, base + 2),
    ];
  });
}

export function decodeMintTraitSeed(raw: unknown): DecodedMintTraitSeed {
  const clean = normalizeTraitSeedHex(raw);
  const bytes = bytesFromHex(clean);
  return {
    faction: bytes[0] & 0x0f,
    ascension: (bytes[0] >> 4) & 0x07,
    type: bytes[22] % 16,
    profession: bytes[23] % 32,
    breed: traitValue(bytes, BREED_OFFSET, 2, 0),
    prestige_count: traitValue(bytes, PRESTIGE_OFFSET, 3, 0),
    appearance: groups(
      bytes,
      APPEARANCE_OFFSET,
      APPEARANCE_GROUPS,
      APPEARANCE_TRAIT_BITS,
    ),
    powers: groups(bytes, POWER_OFFSET, POWER_GROUPS, POWER_TRAIT_BITS),
  };
}

export function visibleAppearance(seed: DecodedMintTraitSeed): number[] {
  return seed.appearance.map((group) => group[0]);
}
