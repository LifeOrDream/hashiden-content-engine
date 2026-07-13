/**
 * CHAPTER → VIDEO PRODUCER — the in-engine bridge that turns one settled war
 * cycle into a rendered Hashiden chapter episode video.
 *
 *   ChapterCycleFacts
 *     → writeChapterAnatomy()      (title / recap beats / cast / cliffhanger — reused)
 *     → buildChapterBlueprint()    (synthesize a Blueprint from the anatomy — the bridge)
 *     → runScriptPipeline()        (the existing script→produce passes → scenes.json)
 *     → generateTrailer()          (the existing Seedance renderer → final.mp4)
 *
 * The insight: a chapter IS an auto-generated blueprint. ChapterAnatomy already
 * carries title, recap beats, cast and a cliffhanger — which map ~1:1 onto the
 * Blueprint the trailer passes consume. So we add NO render code; we synthesize
 * the blueprint and reuse the trailer machinery end to end.
 *
 * This module is the single home for `writeChapterAnatomy` (the LLM call + lint
 * retry + deterministic fallback) so both the `chapter.write` (text) and
 * `chapter.produce` (video) job kinds import it from one place.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { generateText, parseJsonLoose } from "./llm.js";
import {
  biggestClimberFactionId,
  buildChapterAnatomyFallback,
  buildChapterWriterPrompt,
  chapterCountryName,
  lintChapterAnatomy,
  mergeChapterDraft,
  runnerUpFactionId,
  type ChapterAnatomy,
  type ChapterCycleFacts,
} from "../content-engine/chapterWriter.js";
import { runScriptPipeline } from "../../trailer/pipeline/run.js";
import type { Blueprint } from "../../trailer/pipeline/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Chapter anatomy (LLM front-matter + deterministic fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Writers-room-lite for a Hashiden chapter: one LLM call for the front-matter
 * (title / recap beats / cliffhanger) + the deterministic banned-lexicon lint
 * with ONE feedback retry; cover prompt + cast + ledger stay canon-built. Any
 * failure falls back to the deterministic anatomy — the chapter always ships.
 * Set CHAPTER_WRITER_DISABLE_LLM=true to force the reproducible (no-LLM) spine.
 */
export async function writeChapterAnatomy(facts: ChapterCycleFacts): Promise<ChapterAnatomy> {
  if (process.env.CHAPTER_WRITER_DISABLE_LLM === "true") {
    return buildChapterAnatomyFallback(facts);
  }
  const prompt = buildChapterWriterPrompt(facts);
  const attemptOnce = async (feedback?: string): Promise<ChapterAnatomy | null> => {
    const raw = await generateText(feedback ? `${prompt}\n\n${feedback}` : prompt, {
      temperature: 0.85,
      json: true,
    });
    return mergeChapterDraft(facts, parseJsonLoose<any>(raw));
  };
  try {
    let anatomy = await attemptOnce();
    let flags = anatomy ? lintChapterAnatomy(anatomy) : ["structurally invalid draft"];
    if (flags.length > 0) {
      const feedback =
        `REVISION PASS — your previous draft failed the lexicon lint. Fix EVERY flag below (keep the structure, repair only the flagged text):\n` +
        flags.slice(0, 10).map((f) => `- ${f}`).join("\n");
      const second = await attemptOnce(feedback);
      const secondFlags = second ? lintChapterAnatomy(second) : ["structurally invalid draft"];
      if (secondFlags.length === 0) {
        anatomy = second;
        flags = secondFlags;
      }
    }
    if (anatomy && flags.length === 0) return anatomy;
  } catch {
    /* fall through to the deterministic chapter */
  }
  return buildChapterAnatomyFallback(facts);
}

// ─────────────────────────────────────────────────────────────────────────────
// The bridge: ChapterAnatomy → Blueprint
// ─────────────────────────────────────────────────────────────────────────────

/** Concise grounding bullets (story clay) derived from the indexed cycle facts. */
function groundingFactLines(facts: ChapterCycleFacts): string[] {
  const winner = chapterCountryName(facts.winnerFactionId);
  const lines: string[] = [`Winner of war cycle ${facts.warId}: ${winner}.`];
  const runnerUp = runnerUpFactionId(facts);
  if (runnerUp >= 0) lines.push(`Runner-up: ${chapterCountryName(runnerUp)}.`);
  const climber = biggestClimberFactionId(facts);
  if (climber >= 0 && climber !== facts.winnerFactionId) {
    lines.push(`Biggest climb: ${chapterCountryName(climber)} (+${facts.rankDeltas?.[climber]} places).`);
  }
  for (const mvp of facts.mvps || []) {
    lines.push(
      `Country MVP — ${chapterCountryName(mvp.factionId)}: ${mvp.beastName || mvp.ownerCallsign || "(unnamed)"}.`,
    );
  }
  for (const mut of facts.biggestRerolls || []) {
    lines.push(
      `Big ${mut.kind}: ${mut.beastName || mut.mint.slice(0, 6)}` +
        `${mut.kind === "ascension" ? ` → stage ${mut.newStage ?? "?"}` : ""}` +
        `${mut.techniqueName ? ` debuting "${mut.techniqueName}"` : ""}.`,
    );
  }
  for (const intro of facts.mintIntros || []) {
    lines.push(
      `Fresh recruit: ${intro.beastName || intro.mint.slice(0, 6)} joined ${chapterCountryName(intro.factionId ?? facts.winnerFactionId)}.`,
    );
  }
  if ((facts.jackpots || []).length > 0) {
    lines.push(`${facts.jackpots!.length} jackpot${facts.jackpots!.length > 1 ? "s" : ""} hit before the cycle closed.`);
  }
  return lines;
}

/** Story-mode duration band, mirroring the CLI blueprint parser defaults. */
const STORY_TARGET_SECONDS = Number(process.env.CHAPTER_TARGET_SECONDS || 75);
const STORY_MIN_SECONDS = Number(process.env.CHAPTER_MIN_SECONDS || 24);

// ─────────────────────────────────────────────────────────────────────────────
// Episode budget tiering (spec A1) — duration/resolution scale with the
// cycle's real compute budget. Quiet cycle → cheap/short; big cycle → cinematic.
// ─────────────────────────────────────────────────────────────────────────────

export type EpisodeResolution = "480p" | "720p" | "1080p";

export interface EpisodeTier {
  resolution: EpisodeResolution;
  targetSeconds: number;
  /** True when the budget only covers script/anatomy (no video render). */
  skipVideo?: boolean;
}

/** Hard cap on any episode duration (even with a targetSeconds override). */
export const EPISODE_MAX_SECONDS = 120;
const EPISODE_MIN_OVERRIDE_SECONDS = 12;

function normalizeEpisodeResolution(value: string | undefined): EpisodeResolution {
  return value === "480p" || value === "720p" || value === "1080p" ? value : "1080p";
}

/**
 * Map the backend's reserved episode budget (USD) onto a render tier.
 * Seedance cost model: 480p ~$0.07/s, 720p ~$0.13/s, 1080p ~$0.22/s
 * (docs/video-scenes.md) — the backend picks the LARGEST tier that fits.
 *
 *   < $2    → skipVideo (script/anatomy only; chapter ships text + cover prompt)
 *   $2–5    → 480p, 30s
 *   $5–12   → 720p, 48s
 *   $12–20  → 720p, 75s   (current default behavior)
 *   > $20   → 1080p, 90s  (duration capped at EPISODE_MAX_SECONDS)
 */
export function episodeTierForBudget(budgetUsd: number): EpisodeTier {
  if (!Number.isFinite(budgetUsd) || budgetUsd < 2) {
    return { resolution: "480p", targetSeconds: 0, skipVideo: true };
  }
  if (budgetUsd < 5) return { resolution: "480p", targetSeconds: 30 };
  if (budgetUsd < 12) return { resolution: "720p", targetSeconds: 48 };
  if (budgetUsd <= 20) return { resolution: "720p", targetSeconds: 75 };
  return { resolution: "1080p", targetSeconds: 90 };
}

/**
 * Resolve the EFFECTIVE tier for a chapter.produce job: derive from budgetUsd
 * when present, honor a hard targetSeconds override (clamped to the episode
 * cap; an explicit override always renders — it clears skipVideo), and fall
 * back to the current env-driven defaults when neither knob is supplied.
 */
export function resolveEpisodeTier(
  opts: { budgetUsd?: number | null; targetSeconds?: number | null } = {},
): EpisodeTier {
  const base: EpisodeTier =
    opts.budgetUsd != null && Number.isFinite(opts.budgetUsd)
      ? episodeTierForBudget(opts.budgetUsd)
      : {
          resolution: normalizeEpisodeResolution(process.env.TRAILER_VIDEO_RES),
          targetSeconds: STORY_TARGET_SECONDS,
        };
  if (opts.targetSeconds != null && Number.isFinite(opts.targetSeconds) && opts.targetSeconds > 0) {
    return {
      resolution: base.resolution,
      targetSeconds: Math.min(
        EPISODE_MAX_SECONDS,
        Math.max(EPISODE_MIN_OVERRIDE_SECONDS, Math.round(opts.targetSeconds)),
      ),
    };
  }
  return base;
}

/**
 * Synthesize a trailer Blueprint from a chapter's anatomy + facts. The body is
 * the writers-room clay (grounding + ordered beats + cast + cliffhanger + cover
 * direction); the script→produce passes turn it into a render-ready scenes.json.
 */
export function buildChapterBlueprint(
  facts: ChapterCycleFacts,
  anatomy: ChapterAnatomy,
  opts: { targetSeconds?: number } = {},
): Blueprint {
  const targetSeconds =
    opts.targetSeconds && opts.targetSeconds > 0 ? opts.targetSeconds : STORY_TARGET_SECONDS;
  const winner = chapterCountryName(facts.winnerFactionId);
  const aspect = ["16:9", "9:16", "1:1"].includes((process.env.TRAILER_ASPECT || "").trim())
    ? process.env.TRAILER_ASPECT!.trim()
    : "16:9";

  // Cast hints for the passes: country names (real bible entries) + named beasts.
  const castHints = Array.from(
    new Set(
      [winner, chapterCountryName(runnerUpFactionId(facts))]
        .filter((c) => c && !c.startsWith("Faction "))
        .concat(anatomy.cast.map((c) => c.name).filter(Boolean)),
    ),
  ).slice(0, 12);

  const body = [
    `# ${anatomy.title}`,
    `HASHIDEN — the serialized manga of a country-vs-country HashBeast mining war. This chapter covers war cycle ${facts.warId}; ${winner} took the cycle.`,
    `## Grounding facts (story clay — never contradict, never invent results)`,
    groundingFactLines(facts).map((l) => `- ${l}`).join("\n"),
    facts.previousCliffhanger
      ? `## Pays off last chapter's open loop (beat 1 must answer or twist this)\n"${facts.previousCliffhanger}"`
      : "",
    `## Recap beats — the chapter spine, in order`,
    anatomy.recap
      .map((b, i) => `${i + 1}. ${b.beat}${b.callouts.length ? `  (features: ${b.callouts.join(", ")})` : ""}`)
      .join("\n"),
    `## Cast on screen`,
    anatomy.cast
      .map((c) => `- ${c.name} — ${c.role}${c.line ? `: "${c.line}"` : ""}`)
      .join("\n") || "- (ensemble; no single lead earned a callout this cycle)",
    `## Cliffhanger — close on this NEW open question`,
    anatomy.cliffhanger,
    `## Cover-art direction (tone reference for the look)`,
    anatomy.coverPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    id: `chapter-${facts.warId}`,
    title: anatomy.title,
    genre: "story",
    aspect,
    targetSeconds,
    minSeconds: Math.min(STORY_MIN_SECONDS, targetSeconds),
    countdown: process.env.CHAPTER_COUNTDOWN || "04:00:00",
    cta: process.env.CHAPTER_CTA || "Mine your HashBeast — hashiden.tv",
    logline:
      anatomy.recap[0]?.beat?.slice(0, 200) ||
      `War cycle ${facts.warId}: ${winner} takes the crown.`,
    cast: castHints,
    body,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Render + orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render an existing scenes.json into a final video. Shared by fresh production
 * and render-only replays. Seeds TRAILER_ASPECT from the screenplay BEFORE the
 * renderer module loads (ffmpeg computes W/H at import time), mirroring the CLI.
 */
export async function renderScenesToVideo(
  scenesPath: string,
  outDir: string,
  opts: { resolution?: EpisodeResolution } = {},
): Promise<string | null> {
  if (!process.env.TRAILER_ASPECT) {
    try {
      const aspect = JSON.parse(fs.readFileSync(scenesPath, "utf8"))?.aspect;
      if (aspect === "9:16" || aspect === "1:1") process.env.TRAILER_ASPECT = aspect;
    } catch {
      /* default 16:9 */
    }
  }
  // Budget-tier resolution rides the ambient renderConfigStore (NOT a process
  // env reroll — concurrent jobs on one worker would race each other's
  // tiers). renderSequence's videoRes() consults the store per call.
  const { generateTrailer } = await import("../../trailer/generate/generate.js");
  const { renderConfigStore } = await import("../utils/falMedia.js");
  const run = () =>
    generateTrailer(scenesPath, outDir, {
      approvePerScene: false,
      telegramScenes: false,
      fromScene: 1,
      regen: false,
      assemble: true,
    });
  return opts.resolution
    ? renderConfigStore.run({ videoRes: opts.resolution }, run)
    : run();
}

/** Best-effort read of the run's compute estimate (written by the run manifest). */
function readCostUsd(outDir: string): number | null {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(outDir, "run-manifest.json"), "utf8"));
    const usd = m?.costEstimate?.estimatedUsd;
    return typeof usd === "number" ? usd : null;
  } catch {
    return null;
  }
}

export interface ProduceChapterOpts {
  /** Skip writing anatomy (pass a pre-written one, e.g. an archived chapter). */
  anatomy?: ChapterAnatomy;
  /** Stop after scenes.json (skip the expensive render). Default false. */
  scriptOnly?: boolean;
  /** Budget tier (resolveEpisodeTier) — drives duration + render resolution. */
  tier?: EpisodeTier;
}

export interface ProduceChapterResult {
  warId: number;
  anatomy: ChapterAnatomy;
  blueprint: Blueprint;
  scenesPath: string;
  videoPath: string | null;
  costUsd: number | null;
  /** Effective tier used for this production (when one was resolved). */
  tier?: EpisodeTier;
}

/**
 * Produce a full chapter episode video from cycle facts into `outDir`.
 * `outDir` is supplied by the caller (the archive/versioning layer) so each
 * production/replay lands in its own version directory.
 */
export async function produceChapterVideo(
  facts: ChapterCycleFacts,
  outDir: string,
  opts: ProduceChapterOpts = {},
): Promise<ProduceChapterResult> {
  const anatomy = opts.anatomy ?? (await writeChapterAnatomy(facts));
  const tier = opts.tier;
  const blueprint = buildChapterBlueprint(facts, anatomy, {
    targetSeconds: tier && !tier.skipVideo ? tier.targetSeconds : undefined,
  });

  // Persist the synthesized blueprint next to the run for provenance/diffing.
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "blueprint.md"),
    `---\n` +
      `id: ${blueprint.id}\n` +
      `title: ${JSON.stringify(blueprint.title)}\n` +
      `genre: ${blueprint.genre}\n` +
      `aspect: ${blueprint.aspect}\n` +
      `targetSeconds: ${blueprint.targetSeconds}\n` +
      `minSeconds: ${blueprint.minSeconds}\n` +
      `countdown: ${blueprint.countdown}\n` +
      `cta: ${JSON.stringify(blueprint.cta)}\n` +
      `logline: ${JSON.stringify(blueprint.logline)}\n` +
      `cast: ${blueprint.cast.join(", ")}\n` +
      `---\n\n${blueprint.body}\n`,
    "utf8",
  );

  const { scenesPath } = await runScriptPipeline(blueprint, outDir);
  // skipVideo tiers ship the text chapter (anatomy + scenes.json) only — the
  // same guarantee as scriptOnly: the chapter never skips a beat.
  const skipRender = Boolean(opts.scriptOnly || tier?.skipVideo);
  const videoPath = skipRender
    ? null
    : await renderScenesToVideo(scenesPath, outDir, { resolution: tier?.resolution });

  return {
    warId: facts.warId,
    anatomy,
    blueprint,
    scenesPath,
    videoPath,
    costUsd: readCostUsd(outDir),
    tier,
  };
}
