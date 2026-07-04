/**
 * WORLD BRIEF — grounded per-country parody briefs (the `world.brief` job).
 *
 * The MACRO layer behind chapter/reel scripts: one Gemini + Google-Search
 * GROUNDING call returns a current, web-sourced 1-2 sentence PARODY brief per
 * nation — "where this dog-nation stands in the arena right now", grounded in
 * real inter-country dynamics but written as game-world satire. The backend
 * schedules refreshes and persists rows (mineBTC_country_world_brief); this
 * module only generates. RPC-fast (< 30s), dispatch with attempts: 1.
 *
 * Guardrails (ported from the backend's worldEvents service + show canon):
 *   - satire targets INSTITUTIONS and faction behavior, never people — no real
 *     politicians, officials, or any named individual, ever;
 *   - never reference real armed conflicts, casualties, or humanitarian crises
 *     as material — rivalries are framed strictly as arena/mining competition;
 *   - the show's Iran–Israel rivalry is GAME-WORLD lore only, never mapped
 *     onto the real conflict;
 *   - no invented facts: the sourceNote stays vague rather than wrong.
 *
 * Deterministic no-key fallback: without GEMINI_KEY (or on any provider
 * failure) the job soft-fails to `{ briefs: [] }` — callers keep prior briefs.
 */
import { GoogleGenAI } from "@google/genai";
import { COUNTRY_BIBLES } from "../world/bible.js";

// ─────────────────────────────────────────────────────────────────────────────
// Contract (registered in src/service/contracts.ts as "world.brief")
// ─────────────────────────────────────────────────────────────────────────────

export interface WorldBriefInput {
  /** Faction ids to refresh (default: all 12). */
  factionIds?: number[];
  /** Previous briefs for continuity (optional). */
  previous?: Array<{ factionId: number; brief: string }>;
}

export interface WorldBriefResult {
  briefs: Array<{
    factionId: number;
    /** 1-2 sentence display-safe parody brief grounded in real current news. */
    brief: string;
    /** Short real-world hook it parodies (internal, not for display). */
    sourceNote?: string;
    groundedAt: string; // ISO timestamp
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider (Gemini + googleSearch grounding — same client the identity gates use)
// ─────────────────────────────────────────────────────────────────────────────

const BRIEF_MODEL = process.env.WORLD_BRIEF_LLM_MODEL || "gemini-2.5-flash";
const LOOKBACK_DAYS = Math.max(1, Number(process.env.WORLD_BRIEF_LOOKBACK_DAYS || 14));

let genai: GoogleGenAI | null = null;
let genaiKey = "";
function getClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_KEY || "";
  if (!key) return null;
  if (!genai || genaiKey !== key) {
    genai = new GoogleGenAI({ apiKey: key });
    genaiKey = key;
  }
  return genai;
}

interface BriefCountry {
  factionId: number;
  code: string;
  country: string;
}

function briefCountries(factionIds?: number[]): BriefCountry[] {
  const wanted = factionIds && factionIds.length > 0 ? new Set(factionIds) : null;
  return COUNTRY_BIBLES.filter((c) => !wanted || wanted.has(c.factionId)).map((c) => ({
    factionId: c.factionId,
    code: c.code,
    country: c.country,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt (pure — exercised by test:grammar without network)
// ─────────────────────────────────────────────────────────────────────────────

export function buildWorldBriefPrompt(
  countries: BriefCountry[],
  previous?: WorldBriefInput["previous"],
): string {
  const list = countries.map((c) => `${c.country} (code: ${c.code})`).join(", ");
  const prevBlock = (previous || [])
    .map((p) => {
      const match = countries.find((c) => c.factionId === p.factionId);
      return match && p.brief ? `- ${match.country}: ${String(p.brief).slice(0, 240)}` : "";
    })
    .filter(Boolean)
    .join("\n");
  return [
    `You are a geopolitics-literate satire writer feeding HASHIDEN, a country-vs-country cartoon dog-mascot mining show. Each faction is a dog nation competing in an arena. Using CURRENT information from the web (roughly the last ${LOOKBACK_DAYS} days), write a fresh PARODY BRIEF for EACH nation listed.`,
    `NATIONS: ${list}.`,
    `Each brief = where this dog-nation stands in the arena RIGHT NOW, reimagining the nation's real inter-country position (alliances, rivalries, tech/trade races, power plays) as that faction's competitive stance. Punchy, tribal, hype — 1-2 sentences.`,
    `STRICT RULES (a machine lint rejects violations):
1. Satire targets INSTITUTIONS and faction behavior — never people. Do NOT name, quote, or describe any real individual (presidents, ministers, CEOs, officials). Nations only.
2. NEVER reference real armed conflicts, wars, strikes, casualties, or humanitarian crises — not even obliquely. Rivalries are arena/mining competition ONLY (hash-rate races, trade-lane squabbles, tech one-upmanship, alliance drama).
3. The show's Iran–Israel rivalry is strictly game-world lore. Do NOT ground either nation's brief in the real Middle-East conflict; give them arena-native material instead.
4. "sourceNote" is an INTERNAL neutral one-liner naming the real-world hook being parodied (e.g. "chip-export tension", "trade-bloc summit"). Do NOT invent facts — if unsure, keep it vague rather than wrong. Same no-individuals, no-conflict rules apply.
5. Make rivalries line up across briefs (if one nation is circling another, the other's brief reflects being circled).
6. Display-safe: no real product names, no slurs, no wallet addresses, no mechanics jargon.`,
    prevBlock
      ? `PREVIOUS BRIEFS (continuity — evolve these stances, don't repeat them verbatim):\n${prevBlock}`
      : "",
    `Return STRICT JSON ONLY (no markdown):
{
  "briefs": [
    { "code": "<one of: ${countries.map((c) => c.code).join(", ")}>",
      "brief": "<1-2 sentence arena parody stance for this nation>",
      "sourceNote": "<internal neutral one-liner of the real hook>" }
  ]
}
Include every listed nation.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse + generate
// ─────────────────────────────────────────────────────────────────────────────

function parseBriefsJson(raw: string | null): Array<{ code?: string; brief?: string; sourceNote?: string }> {
  if (!raw) return [];
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const tryParse = (s: string): any => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let obj = tryParse(cleaned);
  if (!obj) {
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");
    if (a >= 0 && b > a) obj = tryParse(cleaned.slice(a, b + 1));
  }
  return Array.isArray(obj?.briefs) ? obj.briefs : [];
}

/**
 * Generate grounded parody briefs for the requested factions. Soft-fails to
 * `{ briefs: [] }` without GEMINI_KEY or on any provider/parse failure — the
 * caller keeps its previous briefs.
 */
export async function generateWorldBriefs(input: WorldBriefInput = {}): Promise<WorldBriefResult> {
  const countries = briefCountries(input.factionIds);
  const client = getClient();
  if (!client || countries.length === 0) return { briefs: [] };

  let raw: string | null = null;
  try {
    const response = await client.models.generateContent({
      model: BRIEF_MODEL,
      contents: buildWorldBriefPrompt(countries, input.previous),
      // Google Search grounding keeps briefs current + sourced. NOTE: grounding
      // can't be combined with a strict responseSchema on some model versions,
      // so we request JSON in the prompt and parse loosely.
      config: { tools: [{ googleSearch: {} }] },
    });
    raw = (response.text || "").trim() || null;
  } catch {
    return { briefs: [] };
  }

  const byCode = new Map(countries.map((c) => [c.code, c]));
  const groundedAt = new Date().toISOString();
  const briefs: WorldBriefResult["briefs"] = [];
  const seen = new Set<number>();
  for (const b of parseBriefsJson(raw)) {
    const country = byCode.get(String(b?.code || "").trim().toLowerCase());
    const brief = String(b?.brief || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!country || !brief || seen.has(country.factionId)) continue;
    seen.add(country.factionId);
    const sourceNote = String(b?.sourceNote || "").replace(/\s+/g, " ").trim().slice(0, 240);
    briefs.push({
      factionId: country.factionId,
      brief,
      sourceNote: sourceNote || undefined,
      groundedAt,
    });
  }
  return { briefs };
}
