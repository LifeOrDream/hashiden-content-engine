/**
 * Canonical asset refresh — keeps a HashBeast's portrait current as it
 * rerolls, WITHOUT making a video/voice clip. The "collectible glow-up" layer:
 *
 *  - refreshVisualDp:        trait reroll → regenerate the DP with ONE trait
 *                            changed, identity-gated against the current DP.
 *  - refreshAscensionAssets: ascension → regenerate the full body anchored to
 *                            the new ascension-level base body, then a new DP.
 *
 * Both return artifacts via the artifact store and the refreshed URLs so the
 * caller can chain loop regeneration on the new look. Persisting `asset_urls`
 * and rewriting the Metaplex metadata JSON stays in the backend.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  generateImageEdit,
  generateImageEditFromBuffers,
  fetchAsBuffer,
  validateSameCharacter,
} from "../utils/falMedia.js";
import { logger } from "../utils/logger.js";
import { FACTION_REGISTRY } from "../prompts/index.js";
import { baseTypeRenderNoun, safeBaseType } from "../world/baseTypes.js";
import { decodeTraitSeed } from "./trait_seed.js";
import { BREED_BASE_BODIES, BASE_BODIES_DIR } from "./mintAssets.js";
import type { NftBeastInput } from "./types.js";
import {
  getDefaultArtifactStore,
  storeArtifact,
  type ArtifactStore,
  type NftArtifact,
} from "./artifacts.js";

const VISUAL_TRAIT_GROUPS = [
  "Fur Color",
  "Headwear",
  "Outfit",
  "Weapon",
  "Accessory",
  "Expression",
  "Background",
];

export function visualGroupName(traitIndex: number): string {
  return VISUAL_TRAIT_GROUPS[Math.floor(traitIndex / 3)] || "look";
}

function levelAspect(level: number): string {
  return level >= 6 ? "4:5" : "9:16";
}

/** Resolve the ascension-level base body PNG for (faction, breed, level). */
export async function getAscensionBaseBodyBuffer(
  factionId: number,
  breedValue: number,
  level: number,
): Promise<Buffer | null> {
  const countrySlug = FACTION_REGISTRY[factionId]?.faction?.code?.toLowerCase();
  const breedFile = BREED_BASE_BODIES[factionId]?.[breedValue % 4];
  if (!countrySlug || !breedFile) return null;
  const breedSlug = breedFile.replace(/\.png$/i, "");
  const rel = `${countrySlug}/${level}/${breedSlug}.png`;
  if (BASE_BODIES_DIR) {
    try {
      return fs.readFileSync(path.join(BASE_BODIES_DIR, rel));
    } catch {
      /* not local */
    }
  }
  const baseUrl = process.env.HASHBEAST_BASE_BODIES_BASE_URL;
  if (baseUrl) {
    try {
      return await fetchAsBuffer(`${baseUrl.replace(/\/$/, "")}/${rel}`);
    } catch {
      /* not on CDN */
    }
  }
  if (BASE_BODIES_DIR) {
    try {
      return fs.readFileSync(path.join(BASE_BODIES_DIR, breedFile));
    } catch {
      return null;
    }
  }
  return null;
}

export interface RefreshedAssets {
  fullBody?: NftArtifact;
  dp?: NftArtifact;
  /** Refreshed canonical URLs (store URLs when available, else fal-hosted). */
  assetUrls: { fullBody?: string; dp?: string };
}

/**
 * Trait reroll → regenerate the DP with ONE trait changed (no video).
 * Returns the new DP artifact, or null if references are missing / gen fails.
 */
export async function refreshVisualDp(
  beast: NftBeastInput,
  traitIndex: number,
  newValueName?: string,
  opts: { store?: ArtifactStore } = {},
): Promise<RefreshedAssets | null> {
  const store = opts.store || getDefaultArtifactStore();
  const currentDp = beast.assetUrls?.dp || beast.assetUrls?.fullBody;
  if (!currentDp) return null;
  const group = visualGroupName(traitIndex);

  try {
    const prompt = `Using the attached display picture as reference, render the SAME character with ONE change: its ${group}${newValueName ? ` is now "${newValueName}"` : " has changed"}. Keep everything else identical — same identity, pixel-art style, colors, facing slightly right, upper-body portrait crop. No text, no watermarks.`;
    const newDp = await generateImageEdit(prompt, currentDp, {
      aspectRatio: "1:1",
      resolution: "1K",
    });
    const check = await validateSameCharacter(currentDp, newDp.url, {
      characterNoun: baseTypeRenderNoun(safeBaseType(beast.baseType)),
    });
    if (!check.ok) {
      logger.warning(`asset-refresh: DP validation soft-fail (${check.reason}) — keeping new DP`);
    }
    const dpArtifact = await storeArtifact(store, {
      kind: "dp",
      key: `${beast.storagePath || `misc/${beast.mint}`}/dp.png`,
      buffer: newDp.buffer,
      contentType: "image/png",
      model: newDp.model,
      requestId: newDp.requestId,
    });
    return {
      dp: dpArtifact,
      assetUrls: { ...beast.assetUrls, dp: dpArtifact.url || newDp.url },
    };
  } catch (err: any) {
    logger.warning(
      `refreshVisualDp failed for ${String(beast.mint).slice(0, 8)}…: ${err?.message || err}`,
    );
    return null;
  }
}

/**
 * Ascension → regenerate the full body (anchored to the new ascension-level
 * base body) + a new DP. Returns both artifacts, or null.
 */
export async function refreshAscensionAssets(
  beast: NftBeastInput,
  opts: { store?: ArtifactStore } = {},
): Promise<RefreshedAssets | null> {
  const store = opts.store || getDefaultArtifactStore();
  const currentFullBody = beast.assetUrls?.fullBody || beast.assetUrls?.dp;
  const currentDp = beast.assetUrls?.dp || currentFullBody;
  if (!currentFullBody || !currentDp) return null;
  const basePath = beast.storagePath || `misc/${beast.mint}`;

  let faction = beast.factionId ?? 0;
  let breedValue = beast.breedValue ?? 0;
  let level = beast.ascensionStage ?? 1;
  try {
    if (beast.trait_seed) {
      const d = decodeTraitSeed(beast.trait_seed);
      faction = d.faction;
      breedValue = d.breed;
      level = d.ascension || 1;
    }
  } catch {
    /* fall through with provided values */
  }
  const stageName =
    FACTION_REGISTRY[faction]?.ascensionStages?.[level]?.name || `Stage ${level}`;

  try {
    // Ascension-level base bodies exist for the canine genesis layout only —
    // non-canine base types ascend anchored purely on their own current art.
    const baseType = safeBaseType(beast.baseType);
    const baseBodyBuf =
      baseType === "canine"
        ? await getAscensionBaseBodyBuffer(faction, breedValue, level)
        : null;
    const [fullBodyBuf, dpBuf] = await Promise.all([
      fetchAsBuffer(currentFullBody),
      fetchAsBuffer(currentDp),
    ]);
    const refs: Array<{ buffer: Buffer; mime?: string }> = [];
    if (baseBodyBuf) refs.push({ buffer: baseBodyBuf, mime: "image/png" });
    refs.push({ buffer: fullBodyBuf, mime: "image/png" });
    refs.push({ buffer: dpBuf, mime: "image/png" });

    const refGuide = baseBodyBuf
      ? `THREE reference images are attached, in order: (1) the ASCENDED BASE BODY — use it ONLY for the new body form, silhouette, proportions, and intrinsic elemental features (wings/armor/aura/glowing eyes); (2) the character's CURRENT full body — this is the SOURCE OF TRUTH for identity: carry over the EXACT face, snout, eye shape/color, fur/coat colors and markings, breed, AND all gear/outfit/accessories/headwear; (3) the CURRENT display picture — match this face precisely.`
      : `TWO reference images are attached, in order: (1) the character's CURRENT full body — this is the SOURCE OF TRUTH for identity: carry over the EXACT face, eye shape/color, colors and markings, breed, base type (an anthropomorphic ${baseTypeRenderNoun(baseType)} — never a dog unless it IS a dog), AND all gear/outfit/accessories/headwear; (2) the CURRENT display picture — match this face precisely.`;

    const fbPrompt = [
      `Render the NEW full-body sprite of THIS SAME character after ASCENDING to its "${stageName}" form. It must still be UNMISTAKABLY THE SAME individual — an upgrade of this exact character, NOT a different one.`,
      refGuide,
      `Preserve the character's vibe and recognizability: same coloring, same facial features, same outfit/gear style — only the body grows into the more powerful "${stageName}" form (bigger, stronger, with the ascended stage's elemental flourishes). A fan must instantly recognize it as the same beast leveled up.`,
      `Keep the pixel-art style of the references, upright bipedal standing pose, front-facing, centered, full body head to feet, plain muted gray-blue background. No text or watermarks.`,
    ].join("\n\n");

    const newFullBody = await generateImageEditFromBuffers(fbPrompt, refs, {
      aspectRatio: levelAspect(level),
      resolution: "1K",
    });
    const fullBodyArtifact = await storeArtifact(store, {
      kind: "full_body",
      key: `${basePath}/full_body.png`,
      buffer: newFullBody.buffer,
      contentType: "image/png",
      model: newFullBody.model,
      requestId: newFullBody.requestId,
    });

    const newDp = await generateImageEdit(
      `Using the attached full-body image as reference, create a display picture (portrait crop) of this SAME ascended character — upper body, face slightly to the right, identical pixel-art style and colors, simple background. No text or watermarks.`,
      newFullBody.url,
      { aspectRatio: "1:1", resolution: "1K" },
    );
    const dpArtifact = await storeArtifact(store, {
      kind: "dp",
      key: `${basePath}/dp.png`,
      buffer: newDp.buffer,
      contentType: "image/png",
      model: newDp.model,
      requestId: newDp.requestId,
    });

    logger.success(
      `🦎 Ascension assets refreshed for ${String(beast.mint).slice(0, 8)}… → ${stageName}`,
    );
    return {
      fullBody: fullBodyArtifact,
      dp: dpArtifact,
      assetUrls: {
        fullBody: fullBodyArtifact.url || newFullBody.url,
        dp: dpArtifact.url || newDp.url,
      },
    };
  } catch (err: any) {
    logger.warning(`refreshAscensionAssets failed: ${err?.message || err}`);
    return null;
  }
}
