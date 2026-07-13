/**
 * HashBeast TRAIT_SEED decoder — pure bit-level decode of the 256-bit on-chain TRAIT_SEED.
 *
 * TRAIT_SEED Structure (256 bits / 32 bytes):
 * - Faction: bits 0-3 (4 bits) — values 0-11
 * - Ascension: bits 4-6 (3 bits) — values 0-7
 * - Appearance: bits 7-111 (105 bits) — 7 groups × 3 traits × 5 bits
 * - Power: bits 112-171 (60 bits) — 5 groups × 3 traits × 4 bits
 * - Breed: bits 172-173 (2 bits) — values 0-3
 * - Prestige count: bits 174-176 (3 bits) — values 0-7
 * - Type: derived from trait_seed[22] % 16 (0-7 = Wizard, 8-15 = Muggle)
 * - Profession: derived from trait_seed[23] % 32
 *
 * Ported from the Hashiden backend so the engine can resolve prompts straight
 * from a TRAIT_SEED hex string without any game-state access.
 */

const TRAIT_SEED_CONSTANTS = {
  FACTION_BITS: 4,
  ASCENSION_BITS: 3,
  APPEARANCE_TRAIT_BITS: 5,
  POWER_TRAIT_BITS: 4,
  APPEARANCE_GROUPS: 7,
  POWER_GROUPS: 5,
  TRAITS_PER_GROUP: 3,
} as const;

const APPEARANCE_OFFSET = TRAIT_SEED_CONSTANTS.FACTION_BITS + TRAIT_SEED_CONSTANTS.ASCENSION_BITS; // 7
const APPEARANCE_TOTAL_BITS =
  TRAIT_SEED_CONSTANTS.APPEARANCE_GROUPS *
  TRAIT_SEED_CONSTANTS.TRAITS_PER_GROUP *
  TRAIT_SEED_CONSTANTS.APPEARANCE_TRAIT_BITS; // 105
const COMBAT_OFFSET = APPEARANCE_OFFSET + APPEARANCE_TOTAL_BITS; // 112
const BREED_OFFSET = 172;
const BREED_BITS = 2;
const PRESTIGE_COUNT_OFFSET = BREED_OFFSET + BREED_BITS; // 174
const PRESTIGE_COUNT_BITS = 3;

/** Decoded TRAIT_SEED structure returned by decodeTraitSeed */
export interface DecodedTraitSeed {
  faction: number; // 0-11: Faction ID
  ascension: number; // 0-7: Ascension stage
  type: number; // 0-15: 0-7 = Wizard, 8-15 = Muggle
  profession: number; // 0-31
  breed: number; // 0-3: Breed/body type within faction
  prestige_count: number; // 0-7: Prestige generation
  appearance: [number, number, number][]; // 7 groups of (dominant, recessive1, recessive2)
  powers: [number, number, number][]; // 5 groups of (dominant, recessive1, recessive2)
}

/** Convert hex TRAIT_SEED string to Uint8Array */
export function traitSeedHexToBytes(traitSeedHex: string): Uint8Array {
  const cleanHex = traitSeedHex.startsWith("0x") ? traitSeedHex.slice(2) : traitSeedHex;
  return new Uint8Array(
    cleanHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || new Array(32).fill(0),
  );
}

/** Extract a trait value from TRAIT_SEED bytes at a specific bit position. */
export function getTraitValue(
  traitSeedBytes: Uint8Array,
  offset: number,
  bitsPerTrait: number,
  traitIndex: number,
): number {
  const startBit = offset + traitIndex * bitsPerTrait;
  const byteIdx = Math.floor(startBit / 8);
  const bitIdx = startBit % 8;
  if (byteIdx >= 32) return 0;

  let val = 0;
  let remaining = bitsPerTrait;
  let currByte = byteIdx;
  let currBit = bitIdx;
  while (remaining > 0 && currByte < 32) {
    const bitsInByte = 8 - currBit;
    const take = Math.min(remaining, bitsInByte);
    const mask = ((1 << take) - 1) << currBit;
    const bits = (traitSeedBytes[currByte] & mask) >> currBit;
    val |= bits << (bitsPerTrait - remaining);
    remaining -= take;
    currByte += 1;
    currBit = 0;
  }
  return val;
}

function decodeAppearanceGroups(traitSeedBytes: Uint8Array): [number, number, number][] {
  const groups: [number, number, number][] = [];
  for (let g = 0; g < TRAIT_SEED_CONSTANTS.APPEARANCE_GROUPS; g++) {
    const base = g * TRAIT_SEED_CONSTANTS.TRAITS_PER_GROUP;
    groups.push([
      getTraitValue(traitSeedBytes, APPEARANCE_OFFSET, TRAIT_SEED_CONSTANTS.APPEARANCE_TRAIT_BITS, base),
      getTraitValue(traitSeedBytes, APPEARANCE_OFFSET, TRAIT_SEED_CONSTANTS.APPEARANCE_TRAIT_BITS, base + 1),
      getTraitValue(traitSeedBytes, APPEARANCE_OFFSET, TRAIT_SEED_CONSTANTS.APPEARANCE_TRAIT_BITS, base + 2),
    ]);
  }
  return groups;
}

function decodePowerGroups(traitSeedBytes: Uint8Array): [number, number, number][] {
  const groups: [number, number, number][] = [];
  for (let g = 0; g < TRAIT_SEED_CONSTANTS.POWER_GROUPS; g++) {
    const base = g * TRAIT_SEED_CONSTANTS.TRAITS_PER_GROUP;
    groups.push([
      getTraitValue(traitSeedBytes, COMBAT_OFFSET, TRAIT_SEED_CONSTANTS.POWER_TRAIT_BITS, base),
      getTraitValue(traitSeedBytes, COMBAT_OFFSET, TRAIT_SEED_CONSTANTS.POWER_TRAIT_BITS, base + 1),
      getTraitValue(traitSeedBytes, COMBAT_OFFSET, TRAIT_SEED_CONSTANTS.POWER_TRAIT_BITS, base + 2),
    ]);
  }
  return groups;
}

/** Decode full TRAIT_SEED hex (with or without 0x prefix) into structured format. */
export function decodeTraitSeed(traitSeedHex: string): DecodedTraitSeed {
  const traitSeedBytes = traitSeedHexToBytes(traitSeedHex);
  return {
    faction: traitSeedBytes[0] & 0x0f,
    ascension: (traitSeedBytes[0] >> 4) & 0x07,
    type: traitSeedBytes[22] % 16,
    profession: traitSeedBytes[23] % 32,
    breed: getTraitValue(traitSeedBytes, BREED_OFFSET, BREED_BITS, 0),
    prestige_count: getTraitValue(traitSeedBytes, PRESTIGE_COUNT_OFFSET, PRESTIGE_COUNT_BITS, 0),
    appearance: decodeAppearanceGroups(traitSeedBytes),
    powers: decodePowerGroups(traitSeedBytes),
  };
}

/** Get visible (dominant) appearance traits only — 7 values, one per group. */
export function getVisibleAppearance(traitSeedHex: string): number[] {
  return decodeTraitSeed(traitSeedHex).appearance.map((group) => group[0]);
}

/** Get visible (dominant) power traits only — 5 values, one per group. */
export function getVisiblePowers(traitSeedHex: string): number[] {
  return decodeTraitSeed(traitSeedHex).powers.map((group) => group[0]);
}
