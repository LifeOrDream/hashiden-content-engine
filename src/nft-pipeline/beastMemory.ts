/**
 * BEAST MEMORY — the per-beast story-memory snapshot contract (Phase D1).
 *
 * The engine never reads game state: like everything in this pipeline, memory
 * arrives as a SELF-CONTAINED snapshot inside the job payload. The backend
 * owns storage + assembly (timeline rows, claim/MVP handlers, Redis dialogue
 * memory) and passes a `BeastMemorySnapshot` whenever it wants continuity in
 * the generated content; the engine turns it into prompt context.
 *
 * What memory carries (the contract):
 *   - epithets earned       — milestone-triggered titles (trigger rules below)
 *   - technique debuts      — named country × lane moves first performed
 *                             (fed by B4's `techniqueUsed` job results)
 *   - rivalry history       — per-rival win/loss ledger + the freshest sting
 *   - recent dialogue lines — the beast's last N spoken lines (continuity)
 *   - biggest moment/cycle  — one headline moment per recent war cycle
 *
 * EPITHET TRIGGER RULES (canon — the backend mirrors these when awarding;
 * deriveEpithetTriggers is the reference implementation):
 *   first_claim        → the beast's owner claims their FIRST winning round
 *   win_streak_5       → a claimed win extends the streak to >= 5
 *   evolution_stage_4  → the beast evolves to stage >= 4 (elite band)
 *   country_mvp        → the beast's owner is crowned a cycle's country MVP
 *
 * Titles never enter generated images (no-readable-text rule) — they are text
 * surfaces only (timeline rows, chapter cast lists, dialogue flavor).
 */
import { countryBible } from "../world/bible.js";

// ─────────────────────────────────────────────────────────────────────────────
// Epithets — triggers, canon titles, derivation
// ─────────────────────────────────────────────────────────────────────────────

export type EpithetTriggerId =
  | "first_claim"
  | "win_streak_5"
  | "evolution_stage_4"
  | "country_mvp";

/** Tunable thresholds behind the trigger rules. */
export const EPITHET_WIN_STREAK_THRESHOLD = 5;
export const EPITHET_EVOLUTION_STAGE_THRESHOLD = 4;

/** Canon titles. `{nation}` is replaced with the beast's country name. */
export const EPITHET_CATALOG: Record<
  EpithetTriggerId,
  { title: string; rule: string }
> = {
  first_claim: {
    title: "First Blood",
    rule: "owner claims their first winning round with this beast in the lane",
  },
  win_streak_5: {
    title: "The Unbroken",
    rule: `a claimed win extends the owner's streak to >= ${EPITHET_WIN_STREAK_THRESHOLD}`,
  },
  evolution_stage_4: {
    title: "Ascendant",
    rule: `the beast evolves to stage >= ${EPITHET_EVOLUTION_STAGE_THRESHOLD}`,
  },
  country_mvp: {
    title: "Pride of {nation}",
    rule: "the beast's owner is crowned a cycle's country MVP",
  },
};

export const ALL_EPITHET_TRIGGERS = Object.keys(
  EPITHET_CATALOG,
) as EpithetTriggerId[];

/** Resolve the display title for a trigger (country-flavored where canon says so). */
export function epithetTitle(
  trigger: EpithetTriggerId,
  factionId?: number,
): string {
  const nation =
    typeof factionId === "number"
      ? countryBible(factionId)?.country || `Faction ${factionId}`
      : "its nation";
  return EPITHET_CATALOG[trigger].title.replace("{nation}", nation);
}

/** The stats a trigger evaluation needs — all optional, pass what you have. */
export interface EpithetTriggerStats {
  /** Did the claimed round win? (claim-settled context) */
  won?: boolean;
  /** Owner's career wins AFTER this claim. */
  totalWins?: number;
  /** Owner's win streak AFTER this claim. */
  winStreak?: number;
  /** Evolution target stage (evolution context). */
  newStage?: number;
  /** This beast's owner was crowned a country MVP this cycle. */
  isCountryMvp?: boolean;
}

/**
 * Reference implementation of the trigger rules. Pure + deterministic — the
 * backend mirrors this exact logic at its claim / evolution / settle handlers.
 */
export function deriveEpithetTriggers(
  stats: EpithetTriggerStats,
): EpithetTriggerId[] {
  const out: EpithetTriggerId[] = [];
  if (stats.won === true && stats.totalWins === 1) out.push("first_claim");
  if (
    stats.won === true &&
    (stats.winStreak ?? 0) >= EPITHET_WIN_STREAK_THRESHOLD
  ) {
    out.push("win_streak_5");
  }
  if ((stats.newStage ?? 0) >= EPITHET_EVOLUTION_STAGE_THRESHOLD) {
    out.push("evolution_stage_4");
  }
  if (stats.isCountryMvp === true) out.push("country_mvp");
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The snapshot contract
// ─────────────────────────────────────────────────────────────────────────────

export interface EarnedEpithet {
  trigger: EpithetTriggerId;
  /** Display title at award time (already country-flavored). */
  title: string;
  warId?: number;
  atMs?: number;
}

/** A named technique's first performance (fed by B4 `techniqueUsed.isDebut`). */
export interface TechniqueDebut {
  name: string;
  /** Clip artifact the debut was rendered in, when one exists. */
  clipUrl?: string;
  warId?: number;
  atMs?: number;
}

export interface RivalryRecord {
  rivalFactionId: number;
  wins: number;
  losses: number;
  /** Outcome of the most recent meeting. */
  lastOutcome?: "won" | "lost";
  lastWarId?: number;
}

/** One headline moment per war cycle (the backend picks the biggest). */
export interface CycleMoment {
  warId: number;
  /** Moment vocabulary id (moments.ts MomentType) or a free-form kind. */
  moment: string;
  description: string;
}

/** Self-contained per-beast story memory, assembled by the backend. */
export interface BeastMemorySnapshot {
  epithets?: EarnedEpithet[];
  techniqueDebuts?: TechniqueDebut[];
  rivalries?: RivalryRecord[];
  /** The beast's most recent spoken lines, oldest → newest. */
  recentLines?: string[];
  /** Biggest moment per recent cycle, oldest → newest. */
  biggestMoments?: CycleMoment[];
  /** War the beast joined (minted into). */
  mintedWarId?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt rendering
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LINES = 3;
const MAX_MOMENTS = 3;
const MAX_RIVALRIES = 3;

function rivalName(factionId: number): string {
  return countryBible(factionId)?.country || `Faction ${factionId}`;
}

/**
 * Compact prompt block for dialogue/text passes. Empty string when the
 * snapshot has nothing to say — safe to interpolate unconditionally.
 */
export function beastMemoryPromptBlock(
  memory: BeastMemorySnapshot | undefined | null,
): string {
  if (!memory) return "";
  const parts: string[] = [];
  if (memory.epithets?.length) {
    parts.push(
      `Titles it has earned: ${memory.epithets
        .map((e) => `"${e.title}"${e.warId != null ? ` (war ${e.warId})` : ""}`)
        .join(", ")}.`,
    );
  }
  if (memory.techniqueDebuts?.length) {
    parts.push(
      `Signature moves it has debuted: ${memory.techniqueDebuts
        .map((t) => t.name)
        .join(", ")}.`,
    );
  }
  if (memory.rivalries?.length) {
    const edges = memory.rivalries
      .slice(0, MAX_RIVALRIES)
      .map(
        (r) =>
          `vs ${rivalName(r.rivalFactionId)} ${r.wins}W-${r.losses}L${
            r.lastOutcome ? ` (last: ${r.lastOutcome})` : ""
          }`,
      );
    parts.push(`Its rivalry ledger: ${edges.join("; ")}.`);
  }
  if (memory.recentLines?.length) {
    const lines = memory.recentLines.slice(-MAX_LINES);
    parts.push(
      `Its most recent lines, oldest first: ${lines
        .map((l) => `"${l}"`)
        .join(" then ")}.`,
    );
  }
  if (memory.biggestMoments?.length) {
    const moments = memory.biggestMoments.slice(-MAX_MOMENTS);
    parts.push(
      `Its biggest recent moments: ${moments
        .map((m) => `war ${m.warId} — ${m.description || m.moment}`)
        .join("; ")}.`,
    );
  }
  if (parts.length === 0) return "";
  return (
    `CHARACTER MEMORY (canon continuity — weave it in naturally, never recite it as a list): ` +
    parts.join(" ")
  );
}
