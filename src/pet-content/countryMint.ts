import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHashBeastPrompt,
  resolveHashBeastTraits,
  type ResolvedHashBeastTraits,
} from "../prompts/index.js";
import type { PetVisualPacket } from "./contracts.js";
import {
  conductLine,
  personalityPoseLine,
  visualRemixTarget,
} from "./personalization.js";
import {
  decodeMintTraitSeed,
  visibleAppearance,
  type DecodedMintTraitSeed,
} from "./traitSeed.js";

export const BREED_BASE_BODIES: Record<number, Record<number, string>> = {
  0: { 0: "golden_retriever.png", 1: "husky.png", 2: "corgi.png", 3: "australian_shepherd.png" },
  1: { 0: "chow_chow.png", 1: "shih_tzu.png", 2: "pekingese.png", 3: "chinese_crested.png" },
  2: { 0: "samoyed.png", 1: "borzoi.png", 2: "siberian_husky.png", 3: "yakutian_laika.png" },
  3: { 0: "indian_spitz.png", 1: "rajapalayam.png", 2: "indian_pariah.png", 3: "himalayan_sheepdog.png" },
  4: { 0: "shiba_inu.png", 1: "akita_inu.png", 2: "japanese_spitz.png", 3: "shikoku.png" },
  5: { 0: "jindo.png", 1: "sapsali.png", 2: "white_jindo.png", 3: "pungsan.png" },
  6: { 0: "persian_saluki.png", 1: "sarabi_mastiff.png", 2: "persian_shepherd.png", 3: "khalaj_greyhound.png" },
  7: { 0: "english_bulldog.png", 1: "pembroke_welsh_corgi.png", 2: "border_collie.png", 3: "jack_russell_terrier.png" },
  8: { 0: "pungsan.png", 1: "dark_pungsan.png", 2: "northern_spitz.png", 3: "paektu_wolf_dog.png" },
  9: { 0: "french_bulldog.png", 1: "poodle.png", 2: "papillon.png", 3: "berger_picard.png" },
  10: { 0: "fila_brasileiro.png", 1: "brazilian_terrier.png", 2: "dogue_brasileiro.png", 3: "caramelo_vira_lata.png" },
  11: { 0: "canaan_dog.png", 1: "baladi_dog.png", 2: "israel_pointer.png", 3: "negev_desert_dog.png" },
};

export interface CountryMintProfile {
  decoded: DecodedMintTraitSeed;
  resolved: ResolvedHashBeastTraits;
  traits: number[];
}

export interface ResolvedMintReference {
  buffer: Buffer;
  contentType: string;
  source: string;
}

function profile(packet: PetVisualPacket): CountryMintProfile {
  const decoded = decodeMintTraitSeed(packet.origin.trait_seed);
  const traits = visibleAppearance(decoded);
  return {
    decoded,
    traits,
    resolved: resolveHashBeastTraits(
      decoded.faction,
      decoded.ascension,
      decoded.type,
      traits,
      decoded.breed,
    ),
  };
}

export function resolveCountryMintProfile(packet: PetVisualPacket): CountryMintProfile {
  return profile(packet);
}

export function usesCountryBreedArt(packet: PetVisualPacket): boolean {
  return packet.pet.generation === 0 && packet.pet.species_id === "dog";
}

function archivedCharacterPrompt(packet: PetVisualPacket): string {
  const mint = profile(packet);
  return buildHashBeastPrompt(
    mint.decoded.faction,
    mint.decoded.ascension,
    mint.decoded.type,
    mint.traits,
    mint.decoded.breed,
  );
}

export function buildCountryMintFullBodyPrompt(packet: PetVisualPacket): string {
  return `REFERENCE IMAGE PROVIDED: The attached image is the standing HashBeast body reference. Use it as the strict visual reference for:
- the same upright standing posture and body angle
- the same clean retro pixel-art medium and pixel density
- the same facing direction and full-body framing

Generate a completely new character from the structured country, breed, role, and on-chain appearance traits below. Keep the reference pose and rendering language, but do not copy its country, outfit, colors, or equipment.

${archivedCharacterPrompt(packet)}

CHARACTER ID: HashBeast #${packet.mint.slice(0, 8)}

CRITICAL OUTPUT RULES:
- The stated dog breed must be visible in muzzle, ears, coat, proportions, paws, and tail
- Match the reference posture, pixel-art style, pixel density, and facing direction
- One anthropomorphic standing dog character only, full body visible from head to feet
- Preserve the specified country palette, role, outfit, expression, and background traits
- Country identity comes from palette and design language; never render a national flag as clothing
- Clean collectible sprite with crisp edges and no blur, malformed anatomy, or extra limbs
- No readable text, letters, numbers, logos, watermarks, borders, UI, or overlays
- Character fills most of a 3:4 portrait frame`;
}

function countryEvolutionPersonalityBlock(packet: PetVisualPacket): string {
  const lines = [
    personalityPoseLine(packet),
    conductLine(packet),
    "Show personality only through stance, expression, ear and tail attitude, and micro-pose. It must never change breed anatomy, face geometry, markings, palette, outfit, or equipment.",
  ];
  if (packet.evolution_reason === "visual_reroll") {
    lines.push(
      `REMIX TARGET: ${visualRemixTarget(packet)}.`,
      "Change only that one non-core accent. Do not stack accessories or redesign the character.",
    );
  }
  return lines.join("\n");
}

export function buildCountryEvolutionFullBodyPrompt(packet: PetVisualPacket): string {
  const reason = packet.evolution_reason || "ascension";
  return `REFERENCE IMAGE PROVIDED: The attached image is this exact HashBeast before a ${reason.replace(/_/g, " ")} update.

Preserve the same individual character: exact dog breed anatomy, face geometry, recognizable markings, country identity, pixel-art medium, pixel density, standing posture, and facing direction. Apply only the updated on-chain country-role appearance and ascension traits below.

${archivedCharacterPrompt(packet)}

${countryEvolutionPersonalityBlock(packet)}

EVOLUTION REASON: ${reason}
CHARACTER ID: HashBeast #${packet.mint.slice(0, 8)}

CRITICAL OUTPUT RULES:
- This must remain the same recognizable HashBeast, not a replacement character
- Keep the exact breed silhouette and reference face while applying the updated traits
- One anthropomorphic standing dog character only, full body visible from head to feet
- Keep the reference pixel-art style, pixel density, pose, and facing direction
- Country identity comes from palette and design language; never render a national flag as clothing
- No readable text, letters, numbers, logos, watermarks, borders, UI, or overlays
- Character fills most of a 3:4 portrait frame`;
}

export function buildCountryMintDpPrompt(): string {
  return `Using the attached full-body image as the only identity reference, create the NFT display picture of this exact same HashBeast.

REQUIREMENTS:
- Show only the upper body: head, shoulders, and upper torso
- Face points slightly to the right while the eyes remain expressive and readable
- Preserve the exact breed, face geometry, fur colors, markings, outfit, accessories, and country design language
- Preserve the exact retro pixel-art style and pixel density from the reference
- Simple uncluttered background derived from the full-body image
- Square profile-picture composition with the head filling most of the frame
- No redesign, added equipment, text, letters, numbers, logos, watermark, border, UI, or overlay`;
}

export function countryIdentityBlock(packet: PetVisualPacket): string {
  const faction = profile(packet).resolved.faction;
  return [
    `COUNTRY ORIGIN: ${faction.name}.`,
    `COUNTRY DESIGN LANGUAGE: ${faction.visualIdentity}.`,
    `COUNTRY PALETTE: ${faction.colors.primary}, ${faction.colors.secondary}, ${faction.colors.accent}; restrained ${faction.colors.factionGlow} accent.`,
    "Carry this identity through palette, material, and one compact motif. Never use a national flag as clothing and never caricature ethnicity.",
  ].join("\n");
}

export function countryReferenceStyleBlock(packet: PetVisualPacket): string {
  if (!usesCountryBreedArt(packet)) return "";
  return [
    "REFERENCE STYLE LOCK: preserve the canonical image's exact retro pixel-art medium, pixel density, silhouette, colors, and country design language.",
    "Do not convert the character into painterly illustration, 3D render, photorealism, or smooth vector art.",
  ].join("\n");
}

function mimeFromResponse(value: string | null): string {
  return value?.startsWith("image/") ? value : "image/png";
}

async function fetchReference(url: string, source: string): Promise<ResolvedMintReference> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`reference fetch returned ${response.status}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: mimeFromResponse(response.headers.get("content-type")),
    source,
  };
}

async function readReference(file: string, source: string): Promise<ResolvedMintReference> {
  const extension = path.extname(file).toLowerCase();
  const contentType = extension === ".png"
    ? "image/png"
    : extension === ".webp"
      ? "image/webp"
      : "image/jpeg";
  return { buffer: await fs.readFile(file), contentType, source };
}

async function firstReadable(paths: string[]): Promise<string | null> {
  for (const candidate of paths.filter(Boolean)) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue to the packaged fallback.
    }
  }
  return null;
}

function fallbackPaths(): string[] {
  return [
    process.env.HASHBEAST_PUP_REFERENCE_PATH || "",
    path.resolve(process.cwd(), "assets/pup_reference.jpg"),
    fileURLToPath(new URL("../../assets/pup_reference.jpg", import.meta.url)),
    fileURLToPath(new URL("../../../assets/pup_reference.jpg", import.meta.url)),
  ];
}

function breedBodyPaths(filename: string): string[] {
  const configuredDir = process.env.HASHBEAST_BASE_BODIES_DIR || "";
  return [
    configuredDir ? path.join(configuredDir, filename) : "",
    path.resolve(process.cwd(), "assets/base_bodies", filename),
    fileURLToPath(new URL(`../../assets/base_bodies/${filename}`, import.meta.url)),
    fileURLToPath(new URL(`../../../assets/base_bodies/${filename}`, import.meta.url)),
  ];
}

export async function resolveCountryMintReference(
  packet: PetVisualPacket,
): Promise<ResolvedMintReference> {
  const decoded = profile(packet).decoded;
  const filename = BREED_BASE_BODIES[decoded.faction]?.[decoded.breed];

  if (packet.origin.reference_image_url) {
    return fetchReference(packet.origin.reference_image_url, "packet-reference");
  }

  if (filename) {
    const found = await firstReadable(breedBodyPaths(filename));
    if (found) return readReference(found, `breed-local:${filename}`);
  }

  const baseUrl = String(process.env.HASHBEAST_BASE_BODIES_BASE_URL || "").replace(/\/$/, "");
  if (filename && baseUrl) {
    try {
      return await fetchReference(`${baseUrl}/${filename}`, `breed-cdn:${filename}`);
    } catch {
      // A missing breed image falls through to the known standing-pup reference.
    }
  }

  const fallbackUrl = process.env.HASHBEAST_PUP_REFERENCE_URL || "";
  if (fallbackUrl) {
    return fetchReference(fallbackUrl, "fallback-url:pup_reference.jpg");
  }

  const fallback = await firstReadable(fallbackPaths());
  if (!fallback) {
    throw new Error(
      "No standing mint reference available; configure HASHBEAST_BASE_BODIES_DIR, HASHBEAST_BASE_BODIES_BASE_URL, or HASHBEAST_PUP_REFERENCE_URL",
    );
  }
  return readReference(fallback, "fallback-local:pup_reference.jpg");
}

export function assertCountryMintPromptQuality(prompt: string): void {
  const normalized = prompt.toLowerCase();
  for (const required of [
    "reference image provided",
    "breed / body type",
    "pixel-art",
    "no readable text",
  ]) {
    if (!normalized.includes(required)) {
      throw new Error(`country mint prompt is missing quality rule: ${required}`);
    }
  }
  if (prompt.length > 12_000) throw new Error("country mint prompt exceeds 12000 characters");
}

export function assertCountryEvolutionPromptQuality(prompt: string): void {
  assertCountryMintPromptQuality(prompt);
  const normalized = prompt.toLowerCase();
  for (const required of [
    "same recognizable hashbeast",
    "personality in the pose",
    "conduct:",
  ]) {
    if (!normalized.includes(required)) {
      throw new Error(`country evolution prompt is missing quality rule: ${required}`);
    }
  }
}

export function assertCountryDpPromptQuality(prompt: string): void {
  const normalized = prompt.toLowerCase();
  for (const required of ["exact same hashbeast", "upper body", "pixel-art", "no redesign"]) {
    if (!normalized.includes(required)) {
      throw new Error(`country DP prompt is missing quality rule: ${required}`);
    }
  }
}
