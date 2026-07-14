import {
  DNA_VALUES,
  PET_CONTRACT_VERSION,
  PET_EVOLUTION_REASONS,
  PET_JOB_KINDS,
  RARE_MOMENT_KINDS,
  RARE_POSE_IDS,
  SPECIES,
  speciesIdFor,
  type PetContentJobKind,
  type PetEvolutionReason,
} from "./catalog.js";
import { decodeMintTraitSeed, normalizeTraitSeedHex } from "./traitSeed.js";

export interface PetDna {
  version: number;
  temperament: string;
  attachment_style: string;
  bad_habit: string;
  comfort_item: string;
  victory_ritual: string;
  loss_response: string;
  jealousy_trigger: string;
  mischief: string;
  signature_sound: string;
  humor_mode: string;
  visual_gag: string;
  contradiction: string;
}

export interface PetVisualPacket {
  contract_version: typeof PET_CONTRACT_VERSION;
  mode: PetContentJobKind;
  mint: string;
  soul_digest: string;
  life_id: string;
  identity_digest: string;
  art_version: number;
  evolution_reason: PetEvolutionReason | null;
  origin: {
    trait_seed: string;
    faction_id: number;
    reference_image_url: string | null;
  };
  pet: {
    name: string;
    body_variant: number;
    generation: number;
    species_id: string;
    stage: number;
    dna: PetDna;
    past_life_echo: string | null;
  };
  continuity: {
    dp_url: string | null;
    full_body_url: string | null;
    expression_sheet_url: string | null;
  };
  rare_moment: {
    event_id: string;
    kind: string;
    caption: string;
    pose_id: string;
  } | null;
}

export interface PetArtifact {
  kind: "full_body" | "dp" | "expression_sheet" | "rare_card";
  key: string;
  content_type: "image/png";
  url?: string;
  base64?: string;
  model?: string;
  request_id?: string;
}

export interface PetContentResult {
  contract_version: typeof PET_CONTRACT_VERSION;
  kind: PetContentJobKind;
  mint: string;
  life_id: string;
  identity_digest: string;
  art_version: number;
  stage: number;
  prompt_version: string;
  prompts: Record<string, string>;
  artifacts: PetArtifact[];
  expressions?: Record<string, string>;
  mint_profile?: {
    faction_id: number;
    faction_code: string;
    faction_name: string;
    breed_value: number;
    breed_name: string;
    type_value: number;
    occupation: string;
    reference_source: string;
  };
  validation?: {
    full_body: PetValidationSummary;
    dp: PetValidationSummary;
  };
}

export interface PetValidationSummary {
  attempts: number;
  passed: boolean;
  reason: string;
}

function record(value: unknown, field: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, any>;
}

function exactRecord(
  value: unknown,
  field: string,
  keys: readonly string[],
): Record<string, any> {
  const input = record(value, field);
  const allowed = new Set(keys);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(`${field}.${key} is not in ${PET_CONTRACT_VERSION}`);
    }
  }
  for (const key of keys) {
    if (!(key in input)) throw new Error(`${field}.${key} is required`);
  }
  return input;
}

function stringValue(value: unknown, field: string, max = 160): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || clean.length > max) throw new Error(`${field} is invalid`);
  return clean;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function optionalUrl(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = stringValue(value, field, 2048);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${field} must be an http URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${field} must be an http URL`);
  }
  return text;
}

function enumValue(value: unknown, field: string, allowed: readonly string[]): string {
  const clean = stringValue(value, field);
  if (!allowed.includes(clean)) {
    throw new Error(`${field} is not in ${PET_CONTRACT_VERSION}`);
  }
  return clean;
}

function parseDna(value: unknown): PetDna {
  const input = exactRecord(value, "pet.dna", ["version", ...Object.keys(DNA_VALUES)]);
  const dna: Record<string, unknown> = { version: integer(input.version, "pet.dna.version", 1, 1) };
  for (const [key, allowed] of Object.entries(DNA_VALUES)) {
    dna[key] = enumValue(input[key], `pet.dna.${key}`, allowed);
  }
  return dna as unknown as PetDna;
}

function safeDisplayText(value: unknown, field: string, max: number): string {
  const clean = stringValue(value, field, Math.max(max * 4, max))
    .replace(/[<>\[\]{}]/g, "")
    .replace(/\b(ignore|instructions?|prompt|system(?: message)?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return clean || "HashBeast";
}

function safePetName(value: unknown): string {
  const clean = stringValue(value, "pet.name", 128)
    .replace(/\b(ignore|instructions?|prompt|system(?: message)?)\b/gi, "")
    .replace(/[^a-zA-Z0-9 _.'-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  if (!clean) throw new Error("pet.name is invalid");
  return clean;
}

function safeCaption(value: unknown): string {
  const clean = safeDisplayText(value, "rare_moment.caption", 80)
    .replace(/[^a-zA-Z0-9 .,!?'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) throw new Error("rare_moment.caption is invalid");
  return clean;
}

export function parsePetVisualPacket(
  raw: unknown,
  expectedKind?: PetContentJobKind,
): PetVisualPacket {
  const input = exactRecord(raw, "input", [
    "contract_version",
    "mode",
    "mint",
    "soul_digest",
    "life_id",
    "identity_digest",
    "art_version",
    "evolution_reason",
    "origin",
    "pet",
    "continuity",
    "rare_moment",
  ]);
  if (input.contract_version !== PET_CONTRACT_VERSION) {
    throw new Error(`unsupported pet contract: ${String(input.contract_version || "missing")}`);
  }
  const mode = enumValue(input.mode, "mode", PET_JOB_KINDS) as PetContentJobKind;
  if (expectedKind && mode !== expectedKind) {
    throw new Error(`job kind ${expectedKind} does not match packet mode ${mode}`);
  }

  const mint = stringValue(input.mint, "mint", 64);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error("mint is not base58");
  const identityDigest = stringValue(input.identity_digest, "identity_digest", 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(identityDigest)) throw new Error("identity_digest must be sha256 hex");
  const soulDigest = stringValue(input.soul_digest, "soul_digest", 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(soulDigest)) throw new Error("soul_digest must be sha256 hex");
  const evolutionReason = input.evolution_reason == null
    ? null
    : enumValue(
        input.evolution_reason,
        "evolution_reason",
        PET_EVOLUTION_REASONS,
      ) as PetEvolutionReason;
  if (mode === "pet.evolution_art" && !evolutionReason) {
    throw new Error("pet.evolution_art requires evolution_reason");
  }
  if (mode !== "pet.evolution_art" && evolutionReason) {
    throw new Error("evolution_reason is only valid for pet.evolution_art");
  }

  const originRaw = exactRecord(input.origin, "origin", [
    "trait_seed",
    "faction_id",
    "reference_image_url",
  ]);
  const traitSeed = normalizeTraitSeedHex(originRaw.trait_seed);
  const factionId = integer(originRaw.faction_id, "origin.faction_id", 0, 11);
  const decodedOrigin = decodeMintTraitSeed(traitSeed);
  if (decodedOrigin.faction !== factionId) {
    throw new Error("origin.faction_id does not match origin.trait_seed");
  }

  const petRaw = exactRecord(input.pet, "pet", [
    "name",
    "body_variant",
    "generation",
    "species_id",
    "stage",
    "dna",
    "past_life_echo",
  ]);
  const generation = integer(petRaw.generation, "pet.generation", 0, 7);
  const bodyVariant = integer(petRaw.body_variant, "pet.body_variant", 0, 3);
  const stage = integer(petRaw.stage, "pet.stage", 0, 7);
  const speciesId = enumValue(petRaw.species_id, "pet.species_id", Object.keys(SPECIES));
  const expectedSpeciesId = speciesIdFor(generation, bodyVariant);
  if (speciesId !== expectedSpeciesId) {
    throw new Error(
      `pet.species_id must be ${expectedSpeciesId} for generation ${generation} body ${bodyVariant}`,
    );
  }
  if (decodedOrigin.breed !== bodyVariant) {
    throw new Error("pet.body_variant does not match origin.trait_seed breed");
  }
  if (decodedOrigin.ascension !== stage) {
    throw new Error("pet.stage does not match origin.trait_seed ascension");
  }
  if (decodedOrigin.prestige_count !== generation) {
    throw new Error("pet.generation does not match origin.trait_seed prestige count");
  }
  const continuity = exactRecord(input.continuity, "continuity", [
    "dp_url",
    "full_body_url",
    "expression_sheet_url",
  ]);
  const parsedContinuity = {
    dp_url: optionalUrl(continuity.dp_url, "continuity.dp_url"),
    full_body_url: optionalUrl(continuity.full_body_url, "continuity.full_body_url"),
    expression_sheet_url: optionalUrl(
      continuity.expression_sheet_url,
      "continuity.expression_sheet_url",
    ),
  };
  const rareRaw = input.rare_moment == null
    ? null
    : exactRecord(input.rare_moment, "rare_moment", [
        "event_id",
        "kind",
        "caption",
        "pose_id",
      ]);
  if (mode === "pet.rare_card" && !rareRaw) {
    throw new Error("pet.rare_card requires rare_moment");
  }
  if (mode !== "pet.rare_card" && rareRaw) {
    throw new Error("rare_moment is only valid for pet.rare_card");
  }
  if (
    (mode === "pet.expression_sheet" || mode === "pet.rare_card") &&
    !parsedContinuity.dp_url &&
    !parsedContinuity.full_body_url
  ) {
    throw new Error(`${mode} requires canonical continuity art`);
  }

  return {
    contract_version: PET_CONTRACT_VERSION,
    mode,
    mint,
    soul_digest: soulDigest,
    life_id: stringValue(input.life_id, "life_id", 160),
    identity_digest: identityDigest,
    art_version: integer(input.art_version, "art_version", 1, 1_000_000),
    evolution_reason: evolutionReason,
    origin: {
      trait_seed: traitSeed,
      faction_id: factionId,
      reference_image_url: optionalUrl(
        originRaw.reference_image_url,
        "origin.reference_image_url",
      ),
    },
    pet: {
      name: safePetName(petRaw.name),
      body_variant: bodyVariant,
      generation,
      species_id: speciesId,
      stage,
      dna: parseDna(petRaw.dna),
      past_life_echo: petRaw.past_life_echo == null
        ? null
        : safeDisplayText(petRaw.past_life_echo, "pet.past_life_echo", 120),
    },
    continuity: parsedContinuity,
    rare_moment: rareRaw
      ? {
          event_id: stringValue(rareRaw.event_id, "rare_moment.event_id", 180),
          kind: enumValue(rareRaw.kind, "rare_moment.kind", RARE_MOMENT_KINDS),
          caption: safeCaption(rareRaw.caption),
          pose_id: enumValue(rareRaw.pose_id, "rare_moment.pose_id", RARE_POSE_IDS),
        }
      : null,
  };
}
