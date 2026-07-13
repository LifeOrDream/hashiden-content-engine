/**
 * PHASE D ACCEPTANCE SIMULATION — story engine + chapter generation.
 *
 * Cheap and deterministic: NO network, NO generation spend (the fallback
 * writers-room path). Run via `npm run demo:chapters` (part of check:oss).
 *
 * Proves:
 *  (i)   two CONSECUTIVE chapters assemble, and chapter N+1's recap pays off
 *        chapter N's persisted cliffhanger (quoted in beat 1),
 *  (ii)  a freshly minted fixture beast appears in chapter N+1's CAST with
 *        its "joined the war" intro line,
 *  (iii) the cover prompt stages the WINNING country's bible location card,
 *        forbids readable text, and forbids flag-print clothing,
 *  (iv)  the epithet trigger rules (first claim, win-streak>=5, stage>=4
 *        ascension, country MVP) derive exactly as specced,
 *  (v)   chapter facts compound through the canonize gate into story memory
 *        (cliffhanger becomes the rivalry arc's open question),
 *  (vi)  every static text surface passes the banned-lexicon sweep.
 */
import {
  buildChapterAnatomyFallback,
  buildChapterWriterPrompt,
  lintChapterAnatomy,
  type ChapterCycleFacts,
} from "../src/content-engine/chapterWriter.js";
import {
  ALL_EPITHET_TRIGGERS,
  deriveEpithetTriggers,
  epithetTitle,
  beastMemoryPromptBlock,
  type BeastMemorySnapshot,
} from "../src/nft-pipeline/beastMemory.js";
import {
  buildMintIntroPanelPrompt,
  buildMintIntroDialoguePrompt,
  pickIntroLocation,
} from "../src/nft-pipeline/mintIntro.js";
import { dialogueSmells } from "../src/content-engine/dialogueQuality.js";
import { countryBible } from "../src/world/bible.js";
import {
  applyChapterToMemory,
  defaultStoryMemory,
} from "../trailer/world/storyMemory.js";
import type { NftBeastInput } from "../src/nft-pipeline/types.js";

let failures = 0;
let passes = 0;

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passes += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures: war 41 (China wins) → war 42 (USA wins, fresh recruit joins)
// ─────────────────────────────────────────────────────────────────────────────

const FRESH_MINT = "FixtureMintBolt7xxxxxxxxxxxxxxxxxxxxxxxxxxx";
const FRESH_NAME = "Bolt-7";
const FRESH_INTRO_LINE = "Save my spot on the front — Bolt-7 clocks in!";

const facts41: ChapterCycleFacts = {
  warId: 41,
  winnerFactionId: 1, // China
  finalRanks: [3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  rankDeltas: [-2, 3, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0],
  mvps: [{ factionId: 1, ownerCallsign: "JadeHands", beastName: "Long-9", mint: "ChinaMvpMint" }],
  biggestRerolls: [
    { mint: "EvoMintAaa", beastName: "Ember", factionId: 2, kind: "ascension", newStage: 4 },
  ],
  computeSpentUsd: 18.4,
};

console.log("\nPhase D acceptance — two consecutive chapters\n");

const chapter41 = buildChapterAnatomyFallback(facts41);
check("chapter 41 assembles (title + 3-5 recap beats + cliffhanger)",
  Boolean(chapter41.title) && chapter41.recap.length >= 3 && chapter41.recap.length <= 5 && Boolean(chapter41.cliffhanger));
check("chapter 41 cliffhanger is persisted as a non-empty open loop",
  chapter41.cliffhanger.length > 10);
check("chapter 41 compute ledger passes the spend through",
  chapter41.computeLedger.computeSpentUsd === 18.4);

const facts42: ChapterCycleFacts = {
  warId: 42,
  winnerFactionId: 0, // USA
  finalRanks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  rankDeltas: [2, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  mvps: [{ factionId: 0, ownerCallsign: "RustBeltRex", beastName: "Patriot-1", mint: "UsaMvpMint" }],
  biggestRerolls: [
    { mint: "PowMintBbb", beastName: "Howler", factionId: 0, kind: "power", techniqueName: "Liberty Overdrive" },
  ],
  jackpots: [{ roundId: 4012, factionId: 0 }],
  mintIntros: [
    { mint: FRESH_MINT, beastName: FRESH_NAME, factionId: 0, introLine: FRESH_INTRO_LINE },
  ],
  computeSpentUsd: 22.1,
  // The serialization contract: chapter N's persisted cliffhanger feeds N+1.
  previousCliffhanger: chapter41.cliffhanger,
};

const chapter42 = buildChapterAnatomyFallback(facts42);

// (i) N+1 pays off N's cliffhanger.
check("chapter 42 recap beat 1 quotes chapter 41's cliffhanger",
  chapter42.recap[0].beat.includes(chapter41.cliffhanger),
  `beat 1: ${chapter42.recap[0].beat}`);
check("chapter 42's cliffhanger is a NEW question (not a repeat)",
  chapter42.cliffhanger !== chapter41.cliffhanger && chapter42.cliffhanger.length > 10);

// (ii) The freshly minted fixture beast is in CAST with its intro line.
const freshCast = chapter42.cast.find((m) => m.mint === FRESH_MINT);
check("freshly minted fixture beast appears in chapter 42's CAST",
  Boolean(freshCast) && freshCast!.role === "minted" && freshCast!.name === FRESH_NAME);
check("the fixture recruit carries its intro line in CAST",
  freshCast?.line === FRESH_INTRO_LINE);
check("a recap beat features the fresh recruit",
  chapter42.recap.some((b) => b.beat.includes(FRESH_NAME)));

// (iii) Cover prompt: winning country's bible location, text-free, flag rule.
const usaLocationNames = countryBible(0)!.locations.map((l) => l.name);
check("chapter 42 cover stages one of the WINNING country's bible location cards",
  Boolean(chapter42.coverLocationName) &&
    usaLocationNames.includes(chapter42.coverLocationName!) &&
    chapter42.coverPrompt.includes(chapter42.coverLocationName!));
check("cover prompt forbids readable text in the image",
  /no readable text/i.test(chapter42.coverPrompt));
check("cover prompt forbids flags as clothing",
  /never render any country flag as clothing/i.test(chapter42.coverPrompt));
check("chapter 41 cover stages China's location (winner-driven, not static)",
  chapter41.coverLocationName !== chapter42.coverLocationName);

// The writers-room prompt itself must carry the payoff instruction.
const writerPrompt = buildChapterWriterPrompt(facts42);
check("writers-room prompt instructs beat 1 to pay off the previous cliffhanger",
  writerPrompt.includes("PREVIOUS CHAPTER'S CLIFFHANGER") && writerPrompt.includes(chapter41.cliffhanger));
check("writers-room prompt carries the banned lexicon",
  writerPrompt.includes("BANNED LEXICON"));

// (iv) Epithet trigger rules.
console.log("\nEpithet trigger rules\n");
check("first claim → first_claim",
  deriveEpithetTriggers({ won: true, totalWins: 1 }).includes("first_claim"));
check("second win does NOT re-trigger first_claim",
  !deriveEpithetTriggers({ won: true, totalWins: 2 }).includes("first_claim"));
check("win streak 5 → win_streak_5",
  deriveEpithetTriggers({ won: true, winStreak: 5 }).includes("win_streak_5"));
check("win streak 4 does NOT trigger win_streak_5",
  !deriveEpithetTriggers({ won: true, winStreak: 4 }).includes("win_streak_5"));
check("a LOSS never triggers claim epithets",
  deriveEpithetTriggers({ won: false, totalWins: 1, winStreak: 9 }).length === 0);
check("ascension to stage 4 → ascension_stage_4",
  deriveEpithetTriggers({ newStage: 4 }).includes("ascension_stage_4"));
check("ascension to stage 3 does NOT trigger",
  !deriveEpithetTriggers({ newStage: 3 }).includes("ascension_stage_4"));
check("country MVP → country_mvp",
  deriveEpithetTriggers({ isCountryMvp: true }).includes("country_mvp"));
check("country_mvp title is country-flavored",
  epithetTitle("country_mvp", 0).includes("USA"));

// Memory prompt block renders earned canon.
const memory: BeastMemorySnapshot = {
  epithets: [{ trigger: "first_claim", title: epithetTitle("first_claim", 0), warId: 41 }],
  techniqueDebuts: [{ name: "Liberty Overdrive", warId: 42 }],
  rivalries: [{ rivalFactionId: 1, wins: 1, losses: 2, lastOutcome: "lost" }],
  recentLines: ["Stack it higher!", FRESH_INTRO_LINE],
  biggestMoments: [{ warId: 41, moment: "first_win", description: "first ever claim, stolen in the last round" }],
};
const memBlock = beastMemoryPromptBlock(memory);
check("memory prompt block carries epithets, debuts, rivalry, lines, moments",
  memBlock.includes("First Blood") && memBlock.includes("Liberty Overdrive") &&
  memBlock.includes("vs China 1W-2L") && memBlock.includes(FRESH_INTRO_LINE) &&
  memBlock.includes("war 41"));
check("empty memory renders an empty block", beastMemoryPromptBlock({}) === "");

// Mint intro prompts (the MINT MOMENT job's pure surfaces).
console.log("\nMint moment (joined-the-war intro)\n");
const fixtureBeast: NftBeastInput = {
  mint: FRESH_MINT,
  name: FRESH_NAME,
  factionId: 0,
  personality: { archetype: "overcaffeinated rookie", tone: "loud", motivation: "prove it" },
  assetUrls: { dp: "https://example.invalid/dp.png", fullBody: "https://example.invalid/fb.png" },
};
const introLoc = pickIntroLocation(0);
check("intro location resolves to one of the country's bible location cards",
  Boolean(introLoc) && usaLocationNames.includes(introLoc!.name));
const panelPrompt = buildMintIntroPanelPrompt(fixtureBeast, introLoc!, 0);
check("intro panel prompt stages the bible location + palette",
  panelPrompt.includes(introLoc!.name) && panelPrompt.includes(countryBible(0)!.colors.primary));
check("intro panel prompt forbids readable text + flag clothing",
  /no readable text/i.test(panelPrompt) && /never render any country flag as clothing/i.test(panelPrompt));
const introDlgPrompt = buildMintIntroDialoguePrompt(fixtureBeast, introLoc, memory);
check("intro dialogue prompt is a JOINS-THE-WAR directive with memory woven in",
  introDlgPrompt.includes("JOINS THE WAR") && introDlgPrompt.includes("First Blood"));

// (v) Canonize gate: chapter facts compound into story memory.
console.log("\nCanonize gate (chapter facts → story memory)\n");
let mem = defaultStoryMemory();
mem = applyChapterToMemory(mem, {
  warId: 41,
  title: chapter41.title,
  summary: chapter41.recap.map((b) => b.beat).join(" "),
  cliffhanger: chapter41.cliffhanger,
  winnerCountry: "China",
  countries: ["China", "Russia"],
});
mem = applyChapterToMemory(mem, {
  warId: 42,
  title: chapter42.title,
  summary: chapter42.recap.map((b) => b.beat).join(" "),
  cliffhanger: chapter42.cliffhanger,
  winnerCountry: "USA",
  countries: ["USA", "China"],
  epithetsAwarded: [{ name: FRESH_NAME, title: epithetTitle("first_claim", 0) }],
  techniqueDebuts: ["Liberty Overdrive"],
});
const rivalryArc = mem.arcs.find((a) => a.id === "country-heel-turns")!;
check("both chapters recorded as canonized memory entries",
  mem.videos.filter((v) => v.id.startsWith("chapter-")).length === 2);
check("rivalry arc's open question is now chapter 42's cliffhanger",
  rivalryArc.openQuestion === chapter42.cliffhanger);
check("rivalry arc history compounds chapter to chapter",
  rivalryArc.history.length >= 2);
check("epithets + technique debuts fold into the canon summary",
  (mem.videos.find((v) => v.id === "chapter-42")?.summary || "").includes("Liberty Overdrive"));
check("canonize is idempotent per war (replay overwrites, no dup)",
  applyChapterToMemory(mem, { warId: 42, title: chapter42.title, cliffhanger: chapter42.cliffhanger })
    .videos.filter((v) => v.id === "chapter-42").length === 1);

// (vi) Banned-lexicon sweep over every produced text surface.
console.log("\nBanned-lexicon sweep\n");
const surfaces: Array<[string, string]> = [
  ["chapter 41 title", chapter41.title],
  ["chapter 42 title", chapter42.title],
  ...chapter41.recap.map((b, i) => [`chapter 41 beat ${i}`, b.beat] as [string, string]),
  ...chapter42.recap.map((b, i) => [`chapter 42 beat ${i}`, b.beat] as [string, string]),
  ["chapter 41 cliffhanger", chapter41.cliffhanger],
  ["chapter 42 cliffhanger", chapter42.cliffhanger],
  ...ALL_EPITHET_TRIGGERS.map((t) => [`epithet title ${t}`, epithetTitle(t, 0)] as [string, string]),
  ["memory prompt block", memBlock],
];
let sweptClean = true;
for (const [label, text] of surfaces) {
  const flags = dialogueSmells(text);
  if (flags.length > 0) {
    sweptClean = false;
    console.error(`    banned lexicon in ${label}: ${flags.join("; ")} — "${text}"`);
  }
}
check("every produced text surface is banned-lexicon clean", sweptClean);
check("assembled chapters pass the anatomy lint",
  lintChapterAnatomy(chapter41).length === 0 && lintChapterAnatomy(chapter42).length === 0);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passes} passed, ${failures} failed`);
console.log(`\nChapter 41 → "${chapter41.title}" — cliffhanger: ${chapter41.cliffhanger}`);
console.log(`Chapter 42 → "${chapter42.title}" — beat 1: ${chapter42.recap[0].beat}`);
console.log(`Cast of 42: ${chapter42.cast.map((m) => `${m.name} (${m.role})`).join(", ")}\n`);
if (failures > 0) process.exit(1);
