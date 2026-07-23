import { createHash } from "node:crypto";
import type { PetVisualPacket } from "./contracts.js";

/**
 * Shared personalization slots consumed by BOTH prompt families:
 * the gen>=1 slotted family (prompts.ts) and the G0 country-breed
 * evolution family (countryMint.ts). Kept in its own module so
 * countryMint.ts can use them without a prompts.ts import cycle.
 *
 * Everything here is deterministic. The remix pick hashes
 * identity_digest + art_version, so a given art version always
 * produces the same remix target on replay.
 */

export const VISUAL_REMIXES = [
  "remix one small accessory material with a glossy arcade finish",
  "add one asymmetrical stripe or edge accent outside the locked face marking",
  "reinterpret the signature prop as a tiny upgraded handmade version",
  "shift one secondary material to a playful translucent finish",
  "add one compact lucky charm that does not compete with the signature gag",
  "give the silhouette one slightly bolder non-anatomical accent",
] as const;

export function pickFromDigest<T>(
  values: readonly T[],
  digest: string,
  offset: number,
): T {
  const start = (offset * 4) % Math.max(4, digest.length - 4);
  const value = Number.parseInt(digest.slice(start, start + 4), 16);
  return values[value % values.length];
}

/**
 * Deterministic 1-of-6 remix direction for a visual reroll. Same math the
 * gen>=1 continuity block has always used, so replays stay byte-stable.
 */
export function visualRemixTarget(packet: PetVisualPacket): string {
  const digest = createHash("sha256")
    .update(`${packet.identity_digest}:${packet.art_version}:visual-remix`)
    .digest("hex");
  return pickFromDigest(VISUAL_REMIXES, digest, 0);
}

/**
 * The effective-DNA personality slot. `packet.pet.dna` is the backend's
 * effectiveDna projection (stored dna + filed Enlistment Interview
 * overrides for temperament / victory_ritual / loss_response), so the
 * owner's interview answers reach art through this line.
 */
export function personalityPoseLine(packet: PetVisualPacket): string {
  const dna = packet.pet.dna;
  return `PERSONALITY IN THE POSE: ${dna.temperament}, ${dna.humor_mode}, ${dna.contradiction}.`;
}

/**
 * The interview-derived conduct slot: how this beast wins and loses.
 * Attitude only — the consuming prompt must pin it to expression and
 * posture, never to anatomy, palette, or equipment.
 */
export function conductLine(packet: PetVisualPacket): string {
  const dna = packet.pet.dna;
  return `CONDUCT: on wins it ${dna.victory_ritual}; on losses it ${dna.loss_response}.`;
}
