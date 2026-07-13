/**
 * curator.reason — the Curator's roster-call pass (CURATOR_LOOP_SPEC).
 *
 * Each war cycle, a nation's MVP beast holds the CURATORSHIP: bounded,
 * once-per-war verbs over the nation's vault — RELEASE a held beast into the
 * lootbox queue, COMMISSION a content glow-up for a held beast, SHOWCASE a
 * beast for chapter placement, RELIST a held beast onto the market at the
 * protocol's price (the sale's proceeds return to the nation's treasury).
 * This job drafts the Curator's picks in
 * character: the beast's distilled trait_map (motif / motivation / past-life
 * echoes) colors the voice, and the owner's notes are coaching it weighs but
 * may decline. Everything it returns is a PROPOSAL — the game backend
 * re-validates every pick against its own state and the owner still signs the
 * actual move. This job never executes anything, and it has no pricing
 * authority: it picks WHICH, never price/size/depth.
 *
 * Self-contained snapshot job — the engine reads NO game state: the curator's
 * card, the war standing, the vault contents, and the recent show beats all
 * arrive in the payload.
 *
 * Bounds (the contract the backend assumes):
 *   - verbs limited to `war.verbsAvailable` (at most one pick per verb);
 *   - release/commission/relist may target ONLY listed held mints; showcase
 *     may target any mint provided in the payload;
 *   - each rationale ≤ RATIONALE_MAX chars and must pass the same
 *     banned-lexicon lint the dialogue/chapter surfaces use, with ONE
 *     feedback retry (the dialogue lint loop).
 *
 * Fallback posture: when the LLM is unavailable or keeps failing the lint,
 * the deterministic fallback returns EMPTY picks ON PURPOSE — the caller owns
 * a deterministic rule-based picker of its own and runs it whenever this job
 * yields nothing usable. A non-empty deterministic pick here would duplicate
 * (and race) that picker, so the engine-side fallback stays empty.
 */
import { activeModel, generateText, parseJsonLoose } from "../service/llm.js";
import { logger } from "../utils/logger.js";
import { dialogueSmells } from "../content-engine/dialogueQuality.js";

// ── caps (the render-surface contract) ──
export const RATIONALE_MAX = 280;

// Prompt-side list caps: the vault can hold more, but the Curator reasons over
// the strongest slice; show beats stay a short memory jog, not a transcript.
const HELD_BEASTS_PROMPT_CAP = 8;
const RECENT_BEATS_PROMPT_CAP = 4;
const RECENT_BEAT_MAX = 200;

export type CuratorReasonVerb = "release" | "commission" | "showcase" | "relist";

/** One held (protocol-owned) beast the Curator may release, commission, or relist. */
export interface CuratorHeldBeast {
  mint: string;
  name?: string;
  multiplier?: number;
  echoCount?: number;
  motifLine?: string;
}

export interface CuratorReasonInput {
  warId: number;
  factionId: number;
  factionName: string;
  /** The Curator itself — the MVP beast whose card colors the voice. */
  curator: {
    mint: string;
    callsign?: string;
    motifLine?: string;
    motivation?: string;
    pastLifeEchoes?: string[];
  };
  /** Owner coaching (pre-sanitized by the caller): weighed, never binding. */
  ownerNotes?: string;
  war: {
    /** The nation's current standing (0-based projected rank). */
    rank: number;
    prevRank?: number;
    /** Active nations in the war (rank denominator). Omitted → rank renders bare. */
    nationCount?: number;
    /** Lootbox queue depth (how stocked the nation's boxes are). */
    queueDepth: number;
    /** Verbs not yet spent this war — the ONLY verbs a pick may use. */
    verbsAvailable: CuratorReasonVerb[];
  };
  treasury: {
    warChestLamports: number;
    /** Held beasts (release/commission/relist targets). Prompt uses the top slice. */
    heldBeasts: CuratorHeldBeast[];
  };
  market: {
    floorAnchorLamports?: number;
  };
  show?: {
    /** Short display-safe beats the show already told (avoid repeats). */
    recentBeats?: string[];
  };
}

export interface CuratorReasonPick {
  verb: CuratorReasonVerb;
  mint?: string;
  rationale: string;
}

export interface CuratorReasonResult {
  picks: CuratorReasonPick[];
  /** "llm" | "fallback" — provenance for the backend's cost ledger. */
  source: "llm" | "fallback";
  model?: string;
  costUsd?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic helpers
// ─────────────────────────────────────────────────────────────────────────────

function clip(input: unknown, max: number): string {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Lint every pick's rationale; [] = clean. Mirrors lintTraitMapCard. */
export function lintCuratorPicks(picks: CuratorReasonPick[]): string[] {
  const flags: string[] = [];
  for (const p of picks) {
    for (const f of dialogueSmells(p.rationale)) flags.push(`${p.verb} rationale: ${f}`);
  }
  return flags;
}

/**
 * The DETERMINISTIC fallback — pure, no LLM, never fails, and EMPTY ON
 * PURPOSE. The caller (the game backend) owns a deterministic rule-based
 * picker and dispatches it whenever this job returns no usable picks; an
 * engine-side deterministic pick would duplicate that picker's judgment with
 * less state. Same input → same output.
 */
export function curatorReasonFallback(_input: CuratorReasonInput): CuratorReasonResult {
  return { picks: [], source: "fallback" };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM prompt
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
  "$DEN",
  "DEN token",
].join(", ");

const VERB_MENU: Record<CuratorReasonVerb, string> = {
  release:
    "release — move ONE held beast into the nation's lootbox queue (restocks the drop)",
  commission:
    "commission — order a content glow-up for ONE held beast (reforged art + a redemption lore beat)",
  showcase:
    "showcase — nominate ONE beast for the next chapter's feature placement",
  relist:
    "relist — send ONE held beast to market at the protocol's price (the sale's proceeds return to the nation's treasury)",
};

function lamportsToSol(lamports: number | undefined): string {
  const n = Number(lamports || 0);
  return (n / 1_000_000_000).toFixed(2);
}

export function buildCuratorReasonPrompt(input: CuratorReasonInput): string {
  const callsign = clip(input.curator.callsign, 48) || `the ${input.factionName} Curator`;
  const verbs = (input.war.verbsAvailable || []).filter((v) => VERB_MENU[v]);
  const held = (input.treasury.heldBeasts || [])
    .filter((b) => b && b.mint)
    .slice(0, HELD_BEASTS_PROMPT_CAP);
  const beats = (input.show?.recentBeats || [])
    .filter(Boolean)
    .slice(0, RECENT_BEATS_PROMPT_CAP)
    .map((b) => clip(b, RECENT_BEAT_MAX));

  const voiceLines: string[] = [];
  if (input.curator.motifLine) voiceLines.push(`- motif: ${clip(input.curator.motifLine, 200)}`);
  if (input.curator.motivation) voiceLines.push(`- motivation: ${clip(input.curator.motivation, 400)}`);
  const echoes = (input.curator.pastLifeEchoes || []).filter(Boolean).slice(0, 3);
  if (echoes.length) {
    voiceLines.push(`- past lives: ${echoes.map((e) => clip(e, 300)).join(" | ")}`);
  }

  const warLines = [
    `- ${input.factionName} stands rank ${input.war.rank + 1}${
      input.war.nationCount ? ` of ${input.war.nationCount}` : ""
    }${input.war.prevRank != null ? ` (last war: rank ${input.war.prevRank + 1})` : ""}`,
    `- lootbox queue depth: ${input.war.queueDepth}`,
    `- war chest: ~${lamportsToSol(input.treasury.warChestLamports)} SOL`,
  ];
  if (input.market?.floorAnchorLamports) {
    warLines.push(`- market floor anchor: ~${lamportsToSol(input.market.floorAnchorLamports)} SOL`);
  }

  const heldLines = held.map((b) => {
    const bits = [
      clip(b.name, 48) || "an unnamed beast",
      b.multiplier != null ? `×${b.multiplier}` : "",
      b.echoCount ? `${b.echoCount} past-life echo${b.echoCount === 1 ? "" : "es"}` : "",
      b.motifLine ? clip(b.motifLine, 120) : "",
    ].filter(Boolean);
    return `- ${b.mint} — ${bits.join(", ")}`;
  });

  return [
    `You are ${callsign}, Curator of ${input.factionName} in HASHIDEN — a serialized country-vs-country HashBeast mining war. As this war's MVP beast you hold the nation's curatorship: a handful of once-per-war roster calls over the nation's vault. Draft your picks IN CHARACTER — concrete, physical, ZERO marketing language. You suggest; the owner signs. You never set prices or sizes.`,
    voiceLines.length
      ? `WHO YOU ARE (this card is the voice of every rationale):\n${voiceLines.join("\n")}`
      : `NO DISTILLED CARD — speak as a blunt, working champion of ${input.factionName}.`,
    input.ownerNotes
      ? `OWNER COACHING (weigh it; you may decline it if the war says otherwise): ${clip(input.ownerNotes, 280)}`
      : "",
    `THE WAR RIGHT NOW:\n${warLines.join("\n")}`,
    `VERBS STILL AVAILABLE (use ONLY these; at most ONE pick per verb; skip a verb rather than force a weak call):\n${verbs
      .map((v) => `- ${VERB_MENU[v]}`)
      .join("\n")}`,
    heldLines.length
      ? `HELD BEASTS IN THE VAULT (release/commission/relist may target ONLY these mints):\n${heldLines.join("\n")}`
      : `THE VAULT HOLDS NO BEASTS — release, commission, and relist have no valid target this war.`,
    `SHOWCASE CANDIDATES: any mint listed above, or yourself (${input.curator.mint}).`,
    beats.length
      ? `RECENT SHOW BEATS (do not repeat a story the show just told):\n${beats.map((b) => `- ${b}`).join("\n")}`
      : "",
    `BANNED LEXICON (a machine lint rejects any rationale containing these): ${BANNED_LEXICON_LINE}. Also avoid stating emotions directly — show them through the call itself.`,
    `Write STRICT JSON only (no markdown):
{
  "picks": [
    { "verb": ${(verbs.length ? verbs : (Object.keys(VERB_MENU) as CuratorReasonVerb[]))
      .map((v) => `"${v}"`)
      .join(" | ")}, "mint": "a listed mint", "rationale": "why, in your voice, <= ${RATIONALE_MAX} chars" }
  ]
}
An empty picks array is a valid answer.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Coercion — bound the draft to the contract before it ever reaches the lint.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_VERBS: CuratorReasonVerb[] = ["release", "commission", "showcase", "relist"];

function coercePicks(raw: any, input: CuratorReasonInput): CuratorReasonPick[] | null {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.picks)) return null;
  const verbsAvailable = new Set(input.war.verbsAvailable || []);
  const heldMints = new Set(
    (input.treasury.heldBeasts || []).map((b) => b?.mint).filter(Boolean),
  );
  // Showcase may target any mint the payload provided (held or the Curator).
  const providedMints = new Set<string>([...heldMints]);
  if (input.curator?.mint) providedMints.add(input.curator.mint);

  const seen = new Set<CuratorReasonVerb>();
  const picks: CuratorReasonPick[] = [];
  for (const p of raw.picks) {
    const verb = String(p?.verb || "").toLowerCase() as CuratorReasonVerb;
    if (!ALL_VERBS.includes(verb)) continue;
    if (!verbsAvailable.has(verb) || seen.has(verb)) continue;
    const mint = clip(p?.mint, 64);
    const rationale = clip(p?.rationale, RATIONALE_MAX);
    // Require real signal (guards an empty / one-token rationale).
    if (rationale.replace(/[^a-z]/gi, "").length < 8) continue;
    if (verb === "showcase") {
      if (!mint || !providedMints.has(mint)) continue;
    } else if (!mint || !heldMints.has(mint)) {
      // release / commission / relist move protocol custody — held mints only.
      continue;
    }
    seen.add(verb);
    picks.push({ verb, mint, rationale });
  }
  return picks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration — LLM + one lint retry, deterministic (empty) fallback.
// ─────────────────────────────────────────────────────────────────────────────

export async function reasonCurator(input: CuratorReasonInput): Promise<CuratorReasonResult> {
  if (process.env.CURATOR_REASON_DISABLE_LLM === "true") {
    return curatorReasonFallback(input);
  }
  const prompt = buildCuratorReasonPrompt(input);
  const attemptOnce = async (feedback?: string): Promise<CuratorReasonPick[] | null> => {
    const raw = await generateText(feedback ? `${prompt}\n\n${feedback}` : prompt, {
      temperature: 0.8,
      json: true,
    });
    return coercePicks(parseJsonLoose<any>(raw), input);
  };
  try {
    let picks = await attemptOnce();
    let flags = picks && picks.length > 0 ? lintCuratorPicks(picks) : ["no usable picks in draft"];
    if (flags.length > 0) {
      const feedback =
        `REVISION PASS — your previous draft failed the pick contract or the lexicon lint. Fix EVERY flag below (keep the calls; repair only the flagged text; use only listed verbs and mints):\n` +
        flags.slice(0, 10).map((f) => `- ${f}`).join("\n");
      const second = await attemptOnce(feedback);
      const secondFlags =
        second && second.length > 0 ? lintCuratorPicks(second) : ["no usable picks in draft"];
      if (secondFlags.length === 0) {
        picks = second;
        flags = secondFlags;
      }
    }
    if (picks && picks.length > 0 && flags.length === 0) {
      return { picks, source: "llm", model: activeModel() };
    }
  } catch (e: any) {
    logger.warning(`curator reason: LLM path failed (${e?.message || e}) — deterministic fallback`);
  }
  return curatorReasonFallback(input);
}
