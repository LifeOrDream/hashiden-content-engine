import { createHash } from "node:crypto";
import { PET_PROMPT_VERSION, SPECIES, STAGE_LABELS } from "./catalog.js";
import type { PetVisualPacket } from "./contracts.js";

const PALETTES = [
  "electric teal, tomato red, and warm white",
  "cobalt blue, lemon yellow, and charcoal",
  "jade green, hot pink, and ink black",
  "royal blue, coral, and pale mint",
  "violet, acid green, and cloud white",
  "crimson, cyan, and brushed silver",
  "sunny yellow, deep navy, and cherry red",
  "emerald, lavender, and bright orange",
] as const;

const MARKINGS = [
  "one bold eyebrow-shaped face marking",
  "a clean lightning-shaped side marking",
  "one mismatched ear or horn tip",
  "a bright chest patch shaped like a wonky star",
  "two chunky cheek marks",
  "a single contrasting tail or shell stripe",
] as const;

const EYES = [
  "large amber eyes with tiny square highlights",
  "bright cyan eyes with round highlights",
  "deep brown eyes with one raised brow",
  "lime green eyes with sharp comic timing",
  "violet eyes with soft star highlights",
] as const;

const BODY_VARIANTS = [
  "compact balanced body with a large readable head",
  "slightly tall body with long expressive limbs",
  "round sturdy body with tiny determined feet",
  "wiry spring-loaded body with oversized paws",
] as const;

const STAGE_ENERGY = [
  "newly hatched energy; simple shapes and one tiny accessory",
  "cheeky rascal energy; one crooked detail and an alert pose",
  "busy grinder energy; scuffed accessory and focused stance",
  "confident menace energy; stronger silhouette and smug posture",
  "main-character energy; iconic pose and one upgraded signature detail",
  "boss energy; polished materials and calm authority",
  "legend energy; rare finish and restrained supernatural accent",
  "unleashed final-stage energy; clearest silhouette and one impossible detail",
] as const;

const VISUAL_REMIXES = [
  "remix one small accessory material with a glossy arcade finish",
  "add one asymmetrical stripe or edge accent outside the locked face marking",
  "reinterpret the signature prop as a tiny upgraded handmade version",
  "shift one secondary material to a playful translucent finish",
  "add one compact lucky charm that does not compete with the signature gag",
  "give the silhouette one slightly bolder non-anatomical accent",
] as const;

export interface PetPromptSet {
  full_body: string;
  dp: string;
  expression_sheet: string;
  rare_card: string;
}

export interface VisualIdentity {
  palette: string;
  marking: string;
  eyes: string;
  body: string;
  signatureProp: string;
  lifeToken: string;
}

function pick<T>(values: readonly T[], digest: string, offset: number): T {
  const start = (offset * 4) % Math.max(4, digest.length - 4);
  const value = Number.parseInt(digest.slice(start, start + 4), 16);
  return values[value % values.length];
}

export function deriveVisualIdentity(packet: PetVisualPacket): VisualIdentity {
  const digest = createHash("sha256")
    .update(packet.soul_digest)
    .digest("hex");
  return {
    palette: pick(PALETTES, digest, 0),
    marking: pick(MARKINGS, digest, 1),
    eyes: pick(EYES, digest, 2),
    body: BODY_VARIANTS[packet.pet.body_variant],
    signatureProp: packet.pet.dna.visual_gag,
    lifeToken: packet.pet.dna.comfort_item,
  };
}

function identityBlock(packet: PetVisualPacket): string {
  const species = SPECIES[packet.pet.species_id];
  const visual = deriveVisualIdentity(packet);
  return [
    `SUBJECT: one ${species.renderNoun}.`,
    `SILHOUETTE LOCK: ${species.silhouette}; ${visual.body}.`,
    `COLOR LOCK: ${visual.palette}.`,
    `FACE LOCK: ${visual.eyes}; ${visual.marking}.`,
    `SIGNATURE GAG: ${visual.signatureProp}. Keep it readable, small, and funny.`,
    `LIFE TOKEN: a tiny ${visual.lifeToken}. It is secondary to the signature gag.`,
    `PERSONALITY IN THE POSE: ${packet.pet.dna.temperament}, ${packet.pet.dna.humor_mode}, ${packet.pet.dna.contradiction}.`,
    `SPECIES JOKE: ${species.memeHook}.`,
    `MOTION LANGUAGE: ${species.movement}.`,
    `LIFE STAGE: ${STAGE_LABELS[packet.pet.stage]}; ${STAGE_ENERGY[packet.pet.stage]}.`,
  ].join("\n");
}

const STYLE_BLOCK = [
  "STYLE: premium 2D game-pet illustration, crisp graphic shapes, tactile painted texture, expressive face, playful crypto-native attitude without logos or coin symbols.",
  "TARGET: 70 percent cool and collectible, 30 percent absurd and screenshot-worthy.",
  "READABILITY: instantly recognizable at 64 pixels; one dominant silhouette, two or three large color zones, one signature gag.",
  "Keep the creature clearly pet-like. No human torso, no realistic human hands, no extra limbs, no busy costume stack.",
  "No logos, watermarks, frames, UI, scenery, crowds, weapons, or dense lore props.",
].join("\n");

const NO_TEXT_RULE = "No text, letters, or numbers.";

function continuityBlock(packet: PetVisualPacket): string {
  if (packet.mode !== "pet.evolution_art") return "Create a fresh canonical identity from the locks above.";
  const hasReference = Boolean(
    packet.continuity.full_body_url || packet.continuity.dp_url,
  );
  const locks =
    "Preserve the exact color family, eye identity, face marking, and signature gag so the same soul is immediately recognizable.";
  if (packet.evolution_reason === "rebirth") {
    return [
      hasReference
        ? "REBIRTH RULE: redesign the supplied previous-life pet into the new species and generation."
        : "REBIRTH RULE: create the current species and generation from the soul locks; no previous-life image is available.",
      locks,
      "Change the body plan decisively to the new silhouette. This is a new species, not a costume placed on the old one.",
      "Use the current LIFE TOKEN instead of the previous life's small prop.",
      packet.pet.past_life_echo
        ? `PAST-LIFE ECHO: carry one subtle visual callback to ${packet.pet.past_life_echo}.`
        : hasReference
          ? "PAST-LIFE ECHO: preserve one small shape motif from the reference."
          : "PAST-LIFE ECHO: add one subtle echo motif without changing the new silhouette.",
    ].join("\n");
  }
  if (packet.evolution_reason === "visual_reroll") {
    const digest = createHash("sha256")
      .update(`${packet.identity_digest}:${packet.art_version}:visual-remix`)
      .digest("hex");
    return [
      "VISUAL REROLL RULE: keep the same pet, species, life stage, and body plan.",
      locks,
      hasReference
        ? "Use the supplied canonical pet as the exact identity reference."
        : "No canonical image is available; use the soul locks above as the identity reference.",
      `REMIX TARGET: ${pick(VISUAL_REMIXES, digest, 0)}.`,
      "Change only that non-core accent. Do not stack accessories or redesign the pet.",
    ].join("\n");
  }
  return [
    hasReference
      ? "ASCENSION RULE: evolve the supplied pet to its new life stage without changing species or body plan."
      : "ASCENSION RULE: create the pet at its new life stage from the soul locks without changing species or body plan.",
    locks,
    "Strengthen posture, finish, and one signature detail to match the new stage energy. Keep the upgrade clean and readable.",
  ].join("\n");
}

export function buildFullBodyPrompt(packet: PetVisualPacket): string {
  return [
    `HASHIDEN PET ART ${PET_PROMPT_VERSION}`,
    "Create the canonical full-body collectible art for this pet.",
    identityBlock(packet),
    continuityBlock(packet),
    STYLE_BLOCK,
    NO_TEXT_RULE,
    "COMPOSITION: full body visible from ears or crest to feet or tail, three-quarter view, centered, generous breathing room, simple flat two-tone backdrop with a soft grounding shadow.",
    "The result must feel like a pet someone wants to raise, flex, and react with every day.",
  ].join("\n\n");
}

export function buildDpPrompt(packet: PetVisualPacket): string {
  return [
    `HASHIDEN PET PFP ${PET_PROMPT_VERSION}`,
    "Using the supplied canonical full-body image, create the exact same pet as an iconic square profile picture.",
    identityBlock(packet),
    STYLE_BLOCK,
    NO_TEXT_RULE,
    "IDENTITY: preserve exact colors, face marking, eye design, species, proportions, and signature gag from the reference.",
    "COMPOSITION: head and upper body fill about 78 percent of the square; direct eye contact; bold readable expression; clean contrasting two-tone background; no crop through eyes or signature feature.",
    "Choose a smug, curious, slightly unhinged expression that remains lovable.",
  ].join("\n\n");
}

export function buildExpressionSheetPrompt(packet: PetVisualPacket): string {
  return [
    `HASHIDEN PET EXPRESSIONS ${PET_PROMPT_VERSION}`,
    "Using the supplied canonical pet image, create a clean 3 by 2 expression sheet of the exact same pet.",
    identityBlock(packet),
    STYLE_BLOCK,
    NO_TEXT_RULE,
    "IDENTITY: every cell must preserve the exact species, face geometry, colors, markings, eyes, and signature gag. Do not redesign or age the pet.",
    "GRID ORDER, left to right: top row smug, panic, cope; bottom row hype, sleepy, locked-in.",
    "Each cell is a bust portrait with a distinct face and one simple pose. Use equal gutters and one flat neutral background per cell.",
    "No labels or text. No merged cells. No duplicate expression. No detached body parts.",
  ].join("\n\n");
}

export function buildRareCardPrompt(packet: PetVisualPacket): string {
  const moment = packet.rare_moment;
  const caption = moment?.caption || `${packet.pet.name} did something ridiculous`;
  return [
    `HASHIDEN PET REACTION CARD ${PET_PROMPT_VERSION}`,
    "Using the supplied canonical pet image, create one highly shareable reaction card starring the exact same pet.",
    identityBlock(packet),
    STYLE_BLOCK,
    `MOMENT: ${moment?.kind || "rare moment"}; pose cue ${moment?.pose_id || "victory"}.`,
    `CAPTION: render exactly this short caption once in large clean type: "${caption}".`,
    "COMPOSITION: vertical 4:5 card, pet fills the frame in one exaggerated action, strong graphic burst behind it, thick safe margin, caption in one high-contrast band.",
    "Preserve identity perfectly. One pet only. No badges, fake prices, token symbols, extra copy, logos, or watermark.",
  ].join("\n\n");
}

export function buildPetPromptSet(packet: PetVisualPacket): PetPromptSet {
  return {
    full_body: buildFullBodyPrompt(packet),
    dp: buildDpPrompt(packet),
    expression_sheet: buildExpressionSheetPrompt(packet),
    rare_card: buildRareCardPrompt(packet),
  };
}

const FORBIDDEN_FILM_LANGUAGE = [
  "filmography",
  "screenplay",
  "movie poster",
  "trailer shot",
  "feature film",
  "lore-dense",
];

export function assertPetPromptQuality(prompt: string): void {
  const normalized = prompt.toLowerCase();
  for (const phrase of FORBIDDEN_FILM_LANGUAGE) {
    if (normalized.includes(phrase)) throw new Error(`pet prompt contains legacy phrase: ${phrase}`);
  }
  for (const required of ["64 pixels", "signature gag"] as const) {
    if (!normalized.includes(required)) throw new Error(`pet prompt is missing quality rule: ${required}`);
  }
  if (prompt.length > 5_000) throw new Error("pet prompt exceeds 5000 characters");
}
