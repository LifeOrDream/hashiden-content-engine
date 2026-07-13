/**
 * nft.trait_map_distill — the prompt-trait_map distiller (Spec Part C).
 *
 * The backend owns the beast's off-chain lineage (an event ledger of rerolls,
 * ascensions, prestiges, and sealed whisper intents). Periodically it hands the
 * engine a SELF-CONTAINED snapshot — the previous distilled card plus the new
 * lineage entries and any sealed intents — and asks for a fresh, bounded
 * distillation. The engine reads NO game state: everything needed is in the
 * payload.
 *
 * Output is tightly bounded (the caps are the contract the render surfaces
 * assume):
 *   - motif_line       ≤ 200 chars  — the beast's one-line visual/emotional motif
 *   - motivation       ≤ 400 chars  — what it wants right now (drives dialogue)
 *   - past_life_echo?  ≤ 300 chars  — only on prestige: the prior life folded to one line
 *   - honored_intent_ref? — set when the motivation was driven by a sealed intent
 *
 * Safety: the outputs pass the same banned-lexicon lint the dialogue/chapter
 * surfaces use, with ONE feedback retry (the dialogue lint loop). If the LLM is
 * unavailable or keeps failing the lint, a DETERMINISTIC truncate-and-concat
 * fallback over the previous card + new entries ALWAYS produces a valid card —
 * the pipeline never fails.
 */
import { generateText, parseJsonLoose } from "../service/llm.js";
import { logger } from "../utils/logger.js";
import { dialogueSmells } from "../content-engine/dialogueQuality.js";

// ── caps (the render-surface contract) ──
export const MOTIF_LINE_MAX = 200;
export const MOTIVATION_MAX = 400;
export const PAST_LIFE_ECHO_MAX = 300;

/** One lineage event the backend replayed from the beast's timeline. */
export interface TraitMapLineageEntry {
  /** e.g. "ascension" | "reroll_power" | "reroll_visual" | "epithet" | "technique_debut" | "cycle_summary". */
  event_type: string;
  /** A short pre-summarized description (backend-built; no game-state coupling). */
  summary: string;
  /** Optional war/cycle number for ordering flavor. */
  warId?: number;
}

/** A sealed whisper intent the owner staked, folded into the motivation. */
export interface TraitMapSealedIntent {
  /** Opaque ref the backend attaches the quill mark to (echoed back if honored). */
  ref: string;
  /** Bounded verb (avenge | protect | covet | mourn | boast | scheme | …). */
  verb: string;
  /** Optional target flavor, already display-safe. */
  target?: string;
  /** Optional distilled flavor text (never the owner's raw string). */
  flavor?: string;
}

/** The previous distilled card (or a seed from the mint-time bio). */
export interface TraitMapPreviousCard {
  motif_line?: string;
  motivation?: string;
  past_life_echoes?: string[];
}

export interface NftTraitMapDistillInput {
  mint: string;
  previousCard?: TraitMapPreviousCard;
  newLineageEntries?: TraitMapLineageEntry[];
  sealedIntents?: TraitMapSealedIntent[];
  /** Prestige pass: fold the WHOLE previous card into one past-life echo. */
  prestige?: boolean;
}

export interface NftTraitMapDistillResult {
  motif_line: string;
  motivation: string;
  /** Only present on prestige (or when the fallback folds a prior life). */
  past_life_echo?: string;
  /** Set when the motivation was driven by a sealed intent (newest wins). */
  honored_intent_ref?: string;
  /** "llm" | "fallback" — provenance for the backend's cost ledger. */
  source: "llm" | "fallback";
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic helpers
// ─────────────────────────────────────────────────────────────────────────────

function clip(input: unknown, max: number): string {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Lint a distilled card's text fields; [] = clean. */
export function lintTraitMapCard(
  card: Pick<NftTraitMapDistillResult, "motif_line" | "motivation" | "past_life_echo">,
): string[] {
  const flags: string[] = [];
  for (const f of dialogueSmells(card.motif_line)) flags.push(`motif_line: ${f}`);
  for (const f of dialogueSmells(card.motivation)) flags.push(`motivation: ${f}`);
  if (card.past_life_echo) {
    for (const f of dialogueSmells(card.past_life_echo)) flags.push(`past_life_echo: ${f}`);
  }
  return flags;
}

/**
 * The DETERMINISTIC fallback — pure, no LLM, never fails. Truncate-and-concat
 * the previous card + newest lineage entries into bounded fields, respecting
 * the same caps. Same input → same output (exercised by the grammar suite for
 * determinism). Any banned-lexicon token in the SOURCE material is stripped
 * token-wise so the fallback itself stays lexicon-clean.
 */
export function distillTraitMapFallback(input: NftTraitMapDistillInput): NftTraitMapDistillResult {
  const prev = input.previousCard || {};
  const entries = (input.newLineageEntries || []).filter((e) => e && e.summary);
  const intents = (input.sealedIntents || []).filter((i) => i && i.ref && i.verb);

  // motif_line: keep the previous motif, else synthesize from the newest entry.
  const newestEntry = entries.length > 0 ? entries[entries.length - 1] : undefined;
  const motifSource =
    clip(prev.motif_line, MOTIF_LINE_MAX) ||
    (newestEntry ? `Marked by its ${newestEntry.event_type}: ${newestEntry.summary}` : "") ||
    "A working blade of its faction, still writing its story.";
  let motif_line = scrubBanned(clip(motifSource, MOTIF_LINE_MAX));
  if (motif_line.replace(/[^a-z]/gi, "").length < 8) {
    motif_line = "A working blade of its faction, still writing its story.";
  }

  // motivation: newest sealed intent wins; else previous motivation carried
  // forward and nudged by the newest lineage entry.
  const newestIntent = intents.length > 0 ? intents[intents.length - 1] : undefined;
  let motivationSource: string;
  let honored_intent_ref: string | undefined;
  if (newestIntent) {
    honored_intent_ref = newestIntent.ref;
    const targetPart = newestIntent.target ? ` its ${newestIntent.target}` : "";
    // Deterministic fallback: use the structured verb/target ONLY — never quote
    // the owner's raw `flavor` here. Free text is DISTILLED (by the LLM path),
    // never quoted onto show/chapter surfaces; the fallback is a global surface
    // too, and the fixed-regex scrub can't catch novel injection/attention text,
    // so quoting flavor here would be a persona-filter bypass. Mirrors the
    // backend's fallbackDistill (verb/target, no flavor).
    motivationSource = `Sworn to ${newestIntent.verb}${targetPart}. ${clip(prev.motivation, MOTIVATION_MAX)}`;
  } else {
    const nudge = newestEntry ? ` After its ${newestEntry.event_type}, it presses on.` : "";
    motivationSource = `${clip(prev.motivation, MOTIVATION_MAX) || "Win status for its country without exposing the fear underneath."}${nudge}`;
  }
  let motivation = scrubBanned(clip(motivationSource, MOTIVATION_MAX));
  // If scrubbing collapsed the motivation to a low-signal fragment (a dirty
  // previous card), fall back to the clean default so the card stays coherent.
  if (motivation.replace(/[^a-z]/gi, "").length < 8) {
    motivation = "Win status for its country without exposing the fear underneath.";
  }

  // past_life_echo: on prestige fold the whole previous card into one line.
  let past_life_echo: string | undefined;
  if (input.prestige) {
    const priorEcho = (prev.past_life_echoes || [])[0];
    const echoSource =
      [clip(prev.motif_line, PAST_LIFE_ECHO_MAX), clip(prev.motivation, PAST_LIFE_ECHO_MAX)]
        .filter(Boolean)
        .join(" — ") ||
      priorEcho ||
      "A prior life, ended and reforged from fresh TRAIT_SEED.";
    past_life_echo = scrubBanned(clip(echoSource, PAST_LIFE_ECHO_MAX));
  }

  const result: NftTraitMapDistillResult = { motif_line, motivation, source: "fallback" };
  if (past_life_echo) result.past_life_echo = past_life_echo;
  if (honored_intent_ref) result.honored_intent_ref = honored_intent_ref;
  return result;
}

/** Token-wise strip of any banned-lexicon phrase from deterministic text. */
function scrubBanned(text: string): string {
  let out = text;
  // Iterate until stable (a strip can expose an adjacent match).
  for (let i = 0; i < 4; i++) {
    const smells = dialogueSmells(out);
    if (smells.length === 0) break;
    // dialogueSmells reports the offending phrase after the last ": " — remove it.
    for (const s of smells) {
      const phrase = s.includes(": ") ? s.slice(s.lastIndexOf(": ") + 2) : s;
      if (phrase && phrase.length >= 2) {
        out = out.replace(new RegExp(escapeRegExp(phrase), "gi"), "").replace(/\s+/g, " ").trim();
      }
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export function buildTraitMapDistillPrompt(input: NftTraitMapDistillInput): string {
  const prev = input.previousCard || {};
  const entries = (input.newLineageEntries || []).filter((e) => e && e.summary).slice(-8);
  const intents = (input.sealedIntents || []).filter((i) => i && i.ref && i.verb).slice(-3);

  const prevLines: string[] = [];
  if (prev.motif_line) prevLines.push(`- previous motif: ${clip(prev.motif_line, MOTIF_LINE_MAX)}`);
  if (prev.motivation) prevLines.push(`- previous motivation: ${clip(prev.motivation, MOTIVATION_MAX)}`);
  if ((prev.past_life_echoes || []).length) {
    prevLines.push(`- past-life echoes: ${(prev.past_life_echoes || []).slice(0, 3).map((e) => clip(e, PAST_LIFE_ECHO_MAX)).join(" | ")}`);
  }

  const entryLines = entries.map(
    (e) => `- [${e.event_type}${e.warId != null ? ` #${e.warId}` : ""}] ${clip(e.summary, 200)}`,
  );

  const intentLines = intents.map(
    (i) =>
      `- ref=${i.ref} :: ${i.verb}${i.target ? ` ${i.target}` : ""}${i.flavor ? ` — ${clip(i.flavor, 120)}` : ""}`,
  );

  return [
    `You are the lore-keeper of HASHIDEN, a serialized country-vs-country HashBeast mining war. Distill ONE beast's lineage into a tight prompt trait_map that later drives its dialogue and art. Character-first, concrete, physical — ZERO marketing language.`,
    prevLines.length ? `PREVIOUS CARD (carry forward what still fits; let old motivations decay into motif texture):\n${prevLines.join("\n")}` : `NO PREVIOUS CARD — this beast is early in its story.`,
    entryLines.length ? `NEW LINEAGE EVENTS (newest last — the fresh material to fold in):\n${entryLines.join("\n")}` : "",
    intentLines.length
      ? `SEALED WHISPER INTENTS (owner-sworn; NEWEST WINS conflicts — the motivation MUST honor the newest, and you MUST return its ref as honored_intent_ref; older intents decay into motif texture; never quote the owner verbatim):\n${intentLines.join("\n")}`
      : "",
    input.prestige
      ? `PRESTIGE PASS: this beast just died and reformed. Fold its ENTIRE prior life into ONE past_life_echo line (<= ${PAST_LIFE_ECHO_MAX} chars); the motif/motivation start fresh from the prestiged form.`
      : "",
    `BANNED LEXICON (a machine lint rejects any output containing these): ${BANNED_LEXICON_LINE}. Also avoid single-word prop labels and stating emotions directly ("I'm scared") — show them through behavior.`,
    `Write STRICT JSON only (no markdown):
{
  "motif_line": "the beast's one-line visual/emotional motif, <= ${MOTIF_LINE_MAX} chars",
  "motivation": "what it wants RIGHT NOW, drives its next lines, <= ${MOTIVATION_MAX} chars",${input.prestige ? `\n  "past_life_echo": "its prior life folded to one line, <= ${PAST_LIFE_ECHO_MAX} chars",` : ""}
  "honored_intent_ref": ${intentLines.length ? `"the ref of the sealed intent that drove the motivation (from the list above)"` : `null`}
}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function coerceCard(
  raw: any,
  input: NftTraitMapDistillInput,
): NftTraitMapDistillResult | null {
  if (!raw || typeof raw !== "object") return null;
  const motif_line = clip(raw.motif_line, MOTIF_LINE_MAX);
  const motivation = clip(raw.motivation, MOTIVATION_MAX);
  if (!motif_line || !motivation) return null;
  const result: NftTraitMapDistillResult = { motif_line, motivation, source: "llm" };
  const echo = clip(raw.past_life_echo, PAST_LIFE_ECHO_MAX);
  if (echo) result.past_life_echo = echo;
  // Only accept an honored_intent_ref that matches a supplied sealed intent.
  const validRefs = new Set((input.sealedIntents || []).map((i) => i?.ref).filter(Boolean));
  const ref = clip(raw.honored_intent_ref, 120);
  if (ref && validRefs.has(ref)) result.honored_intent_ref = ref;
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration — LLM + one lint retry, deterministic fallback on any failure
// ─────────────────────────────────────────────────────────────────────────────

export async function distillTraitMap(
  input: NftTraitMapDistillInput,
): Promise<NftTraitMapDistillResult> {
  if (process.env.TRAIT_MAP_DISTILL_DISABLE_LLM === "true") {
    return distillTraitMapFallback(input);
  }
  const prompt = buildTraitMapDistillPrompt(input);
  const attemptOnce = async (feedback?: string): Promise<NftTraitMapDistillResult | null> => {
    const raw = await generateText(feedback ? `${prompt}\n\n${feedback}` : prompt, {
      temperature: 0.8,
      json: true,
    });
    return coerceCard(parseJsonLoose<any>(raw), input);
  };
  try {
    let card = await attemptOnce();
    let flags = card ? lintTraitMapCard(card) : ["structurally invalid draft"];
    if (flags.length > 0) {
      const feedback =
        `REVISION PASS — your previous draft failed the lexicon lint. Fix EVERY flag below (keep the structure, repair only the flagged text):\n` +
        flags.slice(0, 10).map((f) => `- ${f}`).join("\n");
      const second = await attemptOnce(feedback);
      const secondFlags = second ? lintTraitMapCard(second) : ["structurally invalid draft"];
      if (secondFlags.length === 0) {
        card = second;
        flags = secondFlags;
      }
    }
    if (card && flags.length === 0) return card;
  } catch (e: any) {
    logger.warning(`trait_map distill: LLM path failed (${e?.message || e}) — deterministic fallback`);
  }
  return distillTraitMapFallback(input);
}
