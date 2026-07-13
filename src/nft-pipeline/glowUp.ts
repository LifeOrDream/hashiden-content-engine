/**
 * nft.glow_up — the Curator's reforge (CURATOR_LOOP_SPEC §3).
 *
 * A nation's cycle MVP becomes its Curator; when the Curator commissions a
 * held/queued beast for a content glow-up, the backend dispatches this job. It
 * is a SELF-CONTAINED snapshot job — the engine reads NO game state: the beast
 * snapshot (TRAIT_SEED + canonical refs + personality + trait_map), the lineage/echo
 * summary, the curator context, and the faction anchor all arrive in the
 * payload (faction canon is read from the engine's own world bible, which is
 * public canon; the payload may override display fields).
 *
 * It produces three things, reusing existing pipelines:
 *   1. a REFORGED ART SET — the mint-asset pipeline re-run against the beast's
 *      existing TRAIT_SEED/refs (text-free image rules already enforced by that path;
 *      NO lore/motif text is ever fed into an image prompt here, by construction);
 *   2. a ≤600-char REDEMPTION-ARC LORE BEAT linking the beast's past-life echo
 *      to its reforged form — LLM + banned-lexicon lint + ONE feedback retry,
 *      with a DETERMINISTIC fallback that NEVER fails the pipeline
 *      (cloned from nft.trait_map_distill);
 *   3. a short TEASER CLIP via the produce_reel path (the show teases the drop).
 *
 * Best-effort sub-steps (cloned from nft.reroll_content): a failed art regen
 * or a failed teaser never fails the job — the lore beat always ships, and the
 * lore beat itself always ships via the deterministic fallback.
 */
import { generateText } from "../service/llm.js";
import { logger } from "../utils/logger.js";
import { countryBible } from "../world/bible.js";
import { chapterTextSmells } from "../content-engine/chapterWriter.js";
import {
  generateMintAssets,
  type NftMintAssetsInput,
  type NftMintAssetsResult,
} from "./mintAssets.js";
import { produceReel, type ProduceReelResult, type ReelInput } from "../service/reel.js";
import {
  getDefaultArtifactStore,
  type ArtifactStore,
  type NftArtifact,
} from "./artifacts.js";
import type { NftBeastInput } from "./types.js";

// ── cap (the render-surface contract) ──
export const LORE_BEAT_MAX = 600;

// Teaser is deliberately SHORT (the drop-tease, not the episode).
const TEASER_MIN_SECONDS = 6;
const TEASER_MAX_SECONDS = 15;
const TEASER_DEFAULT_SECONDS = 8;

/**
 * Lineage/echo summary — the past life the redemption arc links FROM. Every
 * field is backend-pre-summarized (display-safe; no game-state coupling); the
 * `pastLifeEcho` is typically the distilled trait_map's `past_life_echo`.
 */
export interface GlowUpLineageSummary {
  /** The prior life folded to one line — the thing the reforge redeems. */
  pastLifeEcho?: string;
  /** The beast's current distilled motif line (trait_map card). */
  motifLine?: string;
  /** The beast's current distilled motivation (trait_map card). */
  motivation?: string;
  /** Short pre-summarized lineage bullets (newest last). */
  lineageBullets?: string[];
}

/** Curator context — who commissioned the glow-up, in which war, with what steer. */
export interface GlowUpCuratorContext {
  /** The commissioning war id (flavor + the drop-tease copy). */
  warId?: number;
  /** The Curator's owner display callsign (never a raw wallet). */
  curatorCallsign?: string;
  /** Optional owner directive / theme for the reforge (display-safe flavor). */
  directive?: string;
}

/** Faction canon anchor — the engine reads its own world bible; these override display fields. */
export interface GlowUpFactionCanonOverride {
  country?: string;
  colors?: { primary?: string; secondary?: string; accent?: string; glow?: string };
}

export interface NftGlowUpInput {
  /** Self-contained beast snapshot (TRAIT_SEED, canonical refs, personality, trait_map). */
  beast: NftBeastInput;
  /** Faction anchor (defaults to the beast snapshot's factionId). */
  factionId?: number;
  /** TRAIT_SEED-derived storage-path coordinate the mint-asset pipeline needs (0-31). */
  categoryValue: number;
  /** TRAIT_SEED-derived storage-path coordinate the mint-asset pipeline needs (0-31). */
  regionValue: number;
  /**
   * Breed/style reference for the reforge. Defaults to the beast's existing
   * canonical full-body art so the reforge grounds on its current identity;
   * falls back to the env-resolved breed base body when neither is present.
   */
  referenceImageUrl?: string;
  /** Lineage/echo summary (the past life the redemption arc links FROM). */
  lineage?: GlowUpLineageSummary;
  /** Curator context (who commissioned it + the war + optional directive). */
  curator?: GlowUpCuratorContext;
  /** Faction canon display overrides (engine reads canon from its bible otherwise). */
  faction?: GlowUpFactionCanonOverride;
  /** Also render the cinematic PFP portrait in the reforged set (default false). */
  includeCinematic?: boolean;
  /** Skip the teaser clip (art + lore only) — cheap path. */
  skipTeaser?: boolean;
  /** Teaser target seconds (short; clamped to 6-15). */
  teaserSeconds?: number;
}

export interface NftGlowUpResult {
  mint: string;
  /** The reforged art set (mint-asset pipeline output). Null when regen was skipped/failed. */
  reforgedArt: NftMintAssetsResult | null;
  /** ≤600-char redemption-arc lore beat linking the past-life echo to the new form. */
  loreBeat: string;
  /** Provenance of the lore beat — "llm" | "fallback" — for the backend's cost ledger. */
  loreSource: "llm" | "fallback";
  /** Short teaser clip (produce_reel output). Null when skipped/failed. */
  teaser: ProduceReelResult | null;
  /** Flat list of every stored art artifact (convenience for the backend). */
  artifacts: NftArtifact[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic helpers
// ─────────────────────────────────────────────────────────────────────────────

function clip(input: unknown, max: number): string {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Token/phrase strip of any banned show-lexicon from deterministic text. Retired
 * brand names and $DEN/DEN-token tokens are hard-stripped (their lint reasons do
 * not carry the offending phrase), then the phrase-carrying smells (pitch-deck +
 * stale product) are removed iteratively until stable. Used to keep the
 * deterministic fallback + teaser copy lexicon-clean even from a dirty source.
 */
export function scrubShowLexicon(text: string): string {
  let out = String(text ?? "");
  // Hard-strip retired brands + token tickers (reasons carry no phrase to peel off).
  out = out
    .replace(/\b(minebtc|degenbtc|dbtc|mdoge|mdogewifbtc|dogebtc)\b/gi, "")
    .replace(/\$den\b/gi, "")
    .replace(/\bden token\b/gi, "");
  for (let i = 0; i < 4; i++) {
    const smells = chapterTextSmells(out);
    if (smells.length === 0) break;
    let changed = false;
    for (const s of smells) {
      const phrase = s.includes(": ") ? s.slice(s.lastIndexOf(": ") + 2) : "";
      if (phrase && phrase.length >= 2) {
        const stripped = out.replace(new RegExp(escapeRegExp(phrase), "gi"), "");
        if (stripped !== out) {
          out = stripped;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Resolved faction canon (engine bible, with payload display overrides). */
export function glowUpFactionCanon(input: NftGlowUpInput): {
  factionId: number;
  country: string;
  colors: { primary?: string; secondary?: string; accent?: string; glow?: string };
} {
  const factionId = input.factionId ?? input.beast.factionId ?? 0;
  const bible = countryBible(factionId);
  return {
    factionId,
    country: input.faction?.country || bible?.country || `Faction ${factionId}`,
    colors: input.faction?.colors || bible?.colors || {},
  };
}

/** A clean display label for the beast (scrubbed; falls back to a mint slice / generic). */
function beastLabel(beast: NftBeastInput, generic = "the reforged champion"): string {
  const name = scrubShowLexicon(clip(beast.name, 60));
  if (name.replace(/[^a-z0-9]/gi, "").length >= 2) return name;
  const mint = String(beast.mint || "");
  return mint ? `HashBeast ${mint.slice(0, 6)}…` : generic;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reforged art — reuse the mint-asset pipeline with the beast's TRAIT_SEED/refs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the mint-asset job input for the reforge from the beast snapshot. PURE.
 * Carries ONLY identity coordinates (TRAIT_SEED + faction + storage coords + reference
 * art) — NEVER any lore/motif/curator text, so the text-free image rule holds by
 * construction (nothing lore-shaped can reach an image prompt through here).
 */
export function buildGlowUpMintInput(input: NftGlowUpInput): NftMintAssetsInput {
  const beast = input.beast;
  const canon = glowUpFactionCanon(input);
  return {
    mint: beast.mint,
    name: beast.name,
    owner: undefined,
    trait_seed: beast.trait_seed || "",
    factionId: canon.factionId,
    categoryValue: input.categoryValue,
    regionValue: input.regionValue,
    // The beast's EXISTING refs anchor the reforge on its current identity.
    referenceImageUrl: input.referenceImageUrl || beast.assetUrls?.fullBody || beast.assetUrls?.dp,
    includeCinematic: input.includeCinematic ?? false,
    baseType: beast.baseType,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Redemption-arc lore beat — LLM + one lint retry + deterministic fallback.
// ─────────────────────────────────────────────────────────────────────────────

const BANNED_LEXICON_LINE = [
  "revolutionary",
  "cutting-edge",
  "game-changing",
  "seamless",
  "empower",
  "next-generation",
  "paradigm",
  "supercharge",
  "fair launch",
  "pre-mine",
  "insiders",
  "emissions",
  "yield",
  "leaderboard",
  "APY",
  "dividend",
  "prediction market",
  "oracle",
  "$DEN",
  "DEN token",
].join(", ");

/** Lint the lore beat; [] = clean. Mirrors the chapter-surface lexicon lint. */
export function lintGlowUpLore(loreBeat: string): string[] {
  return chapterTextSmells(loreBeat).map((f) => `loreBeat: ${f}`);
}

/**
 * The DETERMINISTIC fallback — pure, no LLM, NEVER fails. Folds the past-life
 * echo + reforged-form cue into a bounded redemption beat, built from clean
 * canon (country name) + scrubbed snapshot text. If any inserted free-text
 * leaves a lexicon smell that survives scrubbing, it degrades to a fully
 * canon-only sentence (guaranteed clean). Same input → same output.
 */
export function glowUpLoreFallback(input: NftGlowUpInput): string {
  const canon = glowUpFactionCanon(input);
  const country = canon.country; // bible country names are lexicon-clean by construction
  const who = beastLabel(input.beast);
  const echo = scrubShowLexicon(clip(input.lineage?.pastLifeEcho, 240));
  const motif = scrubShowLexicon(
    clip(input.lineage?.motifLine || input.lineage?.motivation, 240),
  );

  const past = echo
    ? `Once ${echo.replace(/^(once|it was)\s+/i, "")}`
    : `Once written off after a life that ended hard`;
  const now = motif
    ? `now it answers the forge as ${motif.replace(/^(a|an|the)\s+/i, "")}`
    : `now it answers the forge remade, the old wounds hammered into new edges`;

  const built = clip(
    `${country}'s Curator called ${who} back to the anvil. ${past}, ${now}. ` +
      `The champion that walks out is not the one that fell — same blood, harder shape, and this time it stays to fight.`,
    LORE_BEAT_MAX,
  );

  // Safety net: if the inserted snapshot text still smells, drop it entirely and
  // ship a clean canon-only beat (never fails, always lexicon-clean).
  if (chapterTextSmells(built).length > 0) {
    return clip(
      `${country}'s Curator called its champion back to the anvil, remade it from the same blood into a harder shape, ` +
        `and sent it back to the war — the one that fell is not the one that returns.`,
      LORE_BEAT_MAX,
    );
  }
  return built;
}

/** Coerce a raw LLM completion into a bounded lore beat (or null when unusable). */
function coerceLore(raw: string | null): string | null {
  if (!raw) return null;
  // The lore beat is prose (not JSON): peel wrapping quotes/markdown fences.
  const cleaned = String(raw)
    .replace(/^```(?:\w+)?/i, "")
    .replace(/```$/i, "")
    .replace(/^\s*["'“”]+|["'“”]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const lore = clip(cleaned, LORE_BEAT_MAX);
  // Require real signal (guards against an empty / one-token completion).
  return lore.replace(/[^a-z]/gi, "").length >= 40 ? lore : null;
}

export function buildGlowUpLorePrompt(input: NftGlowUpInput): string {
  const canon = glowUpFactionCanon(input);
  const bible = countryBible(canon.factionId);
  const who = beastLabel(input.beast);

  const lineageLines: string[] = [];
  if (input.lineage?.pastLifeEcho) {
    lineageLines.push(`- past-life echo (the life the reforge redeems): ${clip(input.lineage.pastLifeEcho, 300)}`);
  }
  if (input.lineage?.motifLine) lineageLines.push(`- current motif: ${clip(input.lineage.motifLine, 200)}`);
  if (input.lineage?.motivation) lineageLines.push(`- current motivation: ${clip(input.lineage.motivation, 200)}`);
  for (const b of (input.lineage?.lineageBullets || []).slice(-5)) {
    lineageLines.push(`- lineage: ${clip(b, 160)}`);
  }

  const curatorLines: string[] = [];
  if (input.curator?.curatorCallsign) {
    curatorLines.push(`- commissioned by ${canon.country}'s Curator (owner callsign ${clip(input.curator.curatorCallsign, 60)})`);
  } else {
    curatorLines.push(`- commissioned by ${canon.country}'s Curator`);
  }
  if (input.curator?.warId != null) curatorLines.push(`- in war cycle ${input.curator.warId}`);
  if (input.curator?.directive) curatorLines.push(`- owner steer (flavor only): ${clip(input.curator.directive, 160)}`);

  return [
    `You are the lore-keeper of HASHIDEN, a serialized country-vs-country HashBeast mining war. A nation's cycle MVP became its CURATOR and has commissioned a content GLOW-UP: a protocol-owned beast is being reforged from its own TRAIT_SEED into a sharper form, and the show needs ONE redemption-arc lore beat.`,
    `SUBJECT: ${who}, of ${canon.country}${bible ? ` — ${clip(bible.lore?.origin, 200)}` : ""}.`,
    lineageLines.length
      ? `LINEAGE / PAST-LIFE MATERIAL (the arc must link the PAST-LIFE ECHO to the reforged NEW FORM — redemption, not a reset):\n${lineageLines.join("\n")}`
      : `NO DISTILLED LINEAGE — treat this as a beast returning reforged after a hard prior life; earn the redemption from the reforge itself.`,
    `CURATOR CONTEXT (a beast-mind's judgment call directed the show's forge here — content-lane only, never mechanics):\n${curatorLines.join("\n")}`,
    `WRITE ONE redemption-arc beat (<= ${LORE_BEAT_MAX} characters): concrete, physical, character-first; link the past-life echo to the new form; land on the beast walking back into the war reforged. Deadpan over bombast. Do NOT mention prices, drops, boxes, budgets, tokens, or any game mechanic — this is story.`,
    `BANNED LEXICON (a machine lint rejects any output containing these): ${BANNED_LEXICON_LINE}. Also never resurface any retired brand/token name, and never state emotions directly ("it was scared") — show them through behavior.`,
    `Output ONLY the lore beat as plain prose — no title, no quotes, no markdown, no JSON.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Orchestrate the lore beat: LLM draft → banned-lexicon lint → ONE feedback
 * retry → deterministic fallback on any failure. NEVER throws.
 */
export async function generateGlowUpLore(
  input: NftGlowUpInput,
): Promise<{ loreBeat: string; source: "llm" | "fallback" }> {
  if (process.env.GLOWUP_DISABLE_LLM === "true") {
    return { loreBeat: glowUpLoreFallback(input), source: "fallback" };
  }
  const prompt = buildGlowUpLorePrompt(input);
  const attemptOnce = async (feedback?: string): Promise<string | null> => {
    const raw = await generateText(feedback ? `${prompt}\n\n${feedback}` : prompt, {
      temperature: 0.8,
    });
    return coerceLore(raw);
  };
  try {
    let lore = await attemptOnce();
    let flags = lore ? lintGlowUpLore(lore) : ["structurally invalid draft"];
    if (flags.length > 0) {
      const feedback =
        `REVISION PASS — your previous draft failed the lexicon lint. Fix EVERY flag below (keep the redemption arc, repair only the flagged text):\n` +
        flags.slice(0, 10).map((f) => `- ${f}`).join("\n");
      const second = await attemptOnce(feedback);
      const secondFlags = second ? lintGlowUpLore(second) : ["structurally invalid draft"];
      if (secondFlags.length === 0) {
        lore = second;
        flags = secondFlags;
      }
    }
    if (lore && flags.length === 0) return { loreBeat: lore, source: "llm" };
  } catch (e: any) {
    logger.warning(`glow-up lore: LLM path failed (${e?.message || e}) — deterministic fallback`);
  }
  return { loreBeat: glowUpLoreFallback(input), source: "fallback" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Teaser clip — the produce_reel path (short).
// ─────────────────────────────────────────────────────────────────────────────

function clampTeaserSeconds(secs?: number): number {
  const n = Number(secs ?? TEASER_DEFAULT_SECONDS);
  if (!Number.isFinite(n)) return TEASER_DEFAULT_SECONDS;
  return Math.min(TEASER_MAX_SECONDS, Math.max(TEASER_MIN_SECONDS, Math.round(n)));
}

/**
 * Build the produce_reel spec for the drop-tease teaser. PURE. Copy is derived
 * from clean faction canon + the ALREADY-LINTED lore beat, and every surfaced
 * field is scrubbed, so the teaser copy stays lexicon-clean by construction.
 */
export function buildGlowUpTeaserSpec(input: NftGlowUpInput, loreBeat: string): ReelInput {
  const canon = glowUpFactionCanon(input);
  const country = canon.country;
  const who = beastLabel(input.beast);
  const lore = scrubShowLexicon(clip(loreBeat, LORE_BEAT_MAX));
  const bodyLines = [
    `# Reforged: ${who}`,
    ``,
    `${country}'s Curator sent ${who} back to the forge. This teaser reveals the reforged champion.`,
    ``,
    `REDEMPTION BEAT: ${lore}`,
    ``,
    `TONE: deadpan reveal, arcade-cel energy, the beast steps out of the light remade. No readable text or UI painted in-frame.`,
  ];
  return {
    id: `glowup-${input.beast.mint}`,
    title: scrubShowLexicon(`Reforged: ${who}`),
    genre: "reveal",
    aspect: "9:16",
    targetSeconds: clampTeaserSeconds(input.teaserSeconds),
    minSeconds: TEASER_MIN_SECONDS,
    cta: `Win it from ${country} — hashiden.tv`,
    logline: scrubShowLexicon(`${country}'s Curator sends a reforged champion back to the war.`),
    cast: [who],
    body: bodyLines.join("\n"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce the full glow-up bundle for one beast. Best-effort sub-steps: a failed
 * art regen or teaser never fails the job; the lore beat always ships (via the
 * deterministic fallback when the LLM path is unavailable).
 */
export async function generateGlowUp(
  input: NftGlowUpInput,
  opts: { store?: ArtifactStore } = {},
): Promise<NftGlowUpResult> {
  const store = opts.store || getDefaultArtifactStore();
  const beast = input.beast;
  const artifacts: NftArtifact[] = [];

  // 1. Reforged art set — mint-asset pipeline against the beast's TRAIT_SEED/refs.
  //    Text-free image rules are enforced by that pipeline; no lore text is fed
  //    in here (buildGlowUpMintInput carries identity coords only).
  let reforgedArt: NftMintAssetsResult | null = null;
  try {
    reforgedArt = await generateMintAssets(buildGlowUpMintInput(input), { store });
    artifacts.push(...reforgedArt.artifacts);
  } catch (e: any) {
    logger.warning(`glow-up: reforge art failed (non-blocking): ${e?.message || e}`);
  }

  // 2. Redemption-arc lore beat — LLM + lint + one retry + deterministic fallback.
  const lore = await generateGlowUpLore(input);

  // 3. Teaser clip via the produce_reel path (short; best-effort).
  let teaser: ProduceReelResult | null = null;
  if (!input.skipTeaser) {
    try {
      teaser = await produceReel(buildGlowUpTeaserSpec(input, lore.loreBeat));
    } catch (e: any) {
      logger.warning(`glow-up: teaser clip failed (non-blocking): ${e?.message || e}`);
    }
  }

  logger.success(
    `✨ glow-up for ${String(beast.mint).slice(0, 8)}… art=${reforgedArt ? "y" : "n"} lore=${lore.source} teaser=${teaser?.videoUrl ? "y" : "n"}`,
  );

  return {
    mint: beast.mint,
    reforgedArt,
    loreBeat: lore.loreBeat,
    loreSource: lore.source,
    teaser,
    artifacts,
  };
}
