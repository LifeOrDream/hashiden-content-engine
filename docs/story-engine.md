# Story Engine — Beast Memory, Mint Moments, and Hashiden Chapters (Phase D)

Phase D turns player beasts into serialized characters: per-beast story memory compounds across cycles, every mint gets a "joined the war" intro, and every settled war cycle assembles into a Hashiden chapter whose cliffhanger the next chapter pays off.

The boundary follows [architecture.md](architecture.md): the engine defines the typed contracts and generates media/text; the game backend owns storage (timeline rows, chapter rows), snapshot assembly, the budget gate that decides whether a job is dispatched at all, and the GraphQL read surface.

## D1 — The beast-memory snapshot contract

`src/nft-pipeline/beastMemory.ts` defines `BeastMemorySnapshot`, the self-contained per-beast story memory the backend assembles and passes inside job payloads:

```ts
interface BeastMemorySnapshot {
  epithets?: EarnedEpithet[];        // milestone-triggered titles
  techniqueDebuts?: TechniqueDebut[];// first performances of named moves (fed by B4's techniqueUsed)
  rivalries?: RivalryRecord[];       // per-rival W/L ledger + freshest sting
  recentLines?: string[];            // the beast's last N spoken lines
  biggestMoments?: CycleMoment[];    // one headline moment per recent cycle
  mintedWarId?: number;
}
```

`memory` is accepted by `nft.mutation_content`, `nft.moment_content`, and `nft.mint_intro`; `beastMemoryPromptBlock(memory)` renders it into the dialogue prompts so lines reference earned titles, debuted techniques, rivalry history, and the beast's own recent lines.

### Epithet trigger rules (canon)

`deriveEpithetTriggers(stats)` is the reference implementation; the backend mirrors it at its claim / evolution / settle handlers and writes timeline rows when a trigger fires:

| Trigger | Rule | Title |
| --- | --- | --- |
| `first_claim` | owner claims their first winning round | "First Blood" |
| `win_streak_5` | a claimed win extends the streak to >= 5 | "The Unbroken" |
| `evolution_stage_4` | the beast evolves to stage >= 4 | "Ascendant" |
| `country_mvp` | the beast's owner is crowned a cycle's country MVP | "Pride of {nation}" |

Titles are text surfaces only — they never enter generated images (no-readable-text rule).

## D1 — `nft.mint_intro` (the mint moment)

On mint-completed the backend enqueues a "joined the war" intro job — **budget-gated exactly like `nft.mutation_content`** (the gate lives backend-side, before enqueue).

- **Input** (`NftMintIntroInput`): `beast` (snapshot with canonical `assetUrls` — run `nft.mint_assets` first), `warId`, optional `memory`, `voiceId`, `skipPanel`.
- **Pipeline**: pick the country's bible location card (HQ preferred) → ONE cheap 16:9 1K intro panel staged on that location with the country palette (arcade-cel rung) → **Gemini identity gate** against the canonical DP (one retry) → one intro line via the normal dialogue path (voiced when possible).
- **Output** (`NftMintIntroResult`): `panel` artifact (`<storagePath>/intro/joined-war-<warId>.png`), `introLine`, `locationName`, `artifacts`.
- **Canon**: no readable text in the image; national identity via costume style + palette — never flags as clothing.

The backend records the result as the beast's `minted` timeline event; the intro line feeds the cycle chapter's CAST.

## D2 — `chapter.write` (writers-room-lite)

Turns a settled cycle's indexed facts into the chapter anatomy. Pure builders live in `src/content-engine/chapterWriter.ts`; the LLM orchestration (one call + banned-lexicon lint + ONE feedback retry + deterministic fallback) lives in the service processor.

- **Input** (`ChapterWriteInput`): `facts: ChapterCycleFacts` — winner, final ranks / rank swings, per-country MVPs (owner callsigns), biggest mutations/evolutions (with B4 technique names), jackpots, mint intros (with intro lines), compute spend, **`previousCliffhanger`** (the previous chapter's persisted cliffhanger), and optional **`worldContext`** (per-country parody hooks from `world.brief`; the writer prompt surfaces the winner's + top movers' briefs — max 4 entries, ≤ 200 chars each — as optional flavor that never contradicts on-chain facts).
- **Output** (`ChapterAnatomy`):
  - **COVER** — `title` + `coverPrompt` staged on the **winning country's bible location card** with its palette (arcade-cel rung, text-free, no flag clothing).
  - **RECAP** — 3-5 beats with character callouts; **beat 1 pays off `previousCliffhanger`** when present (the deterministic fallback quotes it verbatim, so serialization holds even on the zero-spend path).
  - **CAST** — beasts that earned screen time (MVPs, evolutions, technique debuts, fresh recruits carrying their intro lines), owner callsigns.
  - **COMPUTE LEDGER** — cost passthrough from the spend ledger.
  - **CLIFFHANGER** — one NEW open-loop line, PERSISTED by the backend so the next chapter's facts can pay it off.
- **Lint**: every text field passes `dialogueSmells` + chapter-surface bans (stale product language); a draft that fails twice ships the deterministic fallback instead.
- `CHAPTER_WRITER_DISABLE_LLM=true` forces the deterministic path (used by the acceptance sim).

Backend dispatch is budget-gated like other content jobs (`story` event type); optional TTS narration and the cycle-MP4 recap reel are backend-side, flag-gated reuses of existing paths.

## D3 — `chapter.canonize` (the publish gate into story memory)

After the backend persists a chapter, it pushes the chapter facts through the canonize gate so arcs/epithets/rivalries compound cycle to cycle:

- **Input** (`ChapterCanonizeInput`): `chapter: ChapterCanonInput` — warId, title, summary, cliffhanger, winner country, involved countries, epithets awarded, technique debuts.
- **Effect** (`canonizeChapter` in `trailer/world/storyMemory.ts`): records the chapter as a canonized memory entry (`chapter-<warId>`, idempotent on replay), folds the summary into `worldSoFar`, keeps the rivalry arc warm and replaces its open question with the new cliffhanger, and touches the involved characters' memory. Future trailer/showrunner script runs read this memory packet.

`applyChapterToMemory` is the pure fold (exported for simulations — no disk writes).

## `chapter.produce` — budget tiering + hosted URLs

`chapter.produce` (the episode video job, `src/service/chapterVideo.ts`) accepts an optional
`budgetUsd` — the compute budget the backend reserved for this episode — and derives the
render tier via `episodeTierForBudget`:

| budgetUsd | tier |
| --- | --- |
| < $2 | `skipVideo` — script/anatomy only (the chapter still ships text + cover prompt) |
| $2–5 | 480p, 30s |
| $5–12 | 720p, 48s |
| $12–20 | 720p, 75s (the no-budget default) |
| > $20 | 1080p, 90s (any `targetSeconds` override is capped at 120s) |

When the artifact store is S3 (`NFT_ARTIFACT_STORE=s3`, or auto with a bucket configured) the
job uploads `chapters/<warId>/final.mp4` + `chapters/<warId>/cover.png` (the first rendered
sequence start-frame) and returns hosted `videoUrl` / `coverUrl` — same upload path as
`produce_reel`. Inline mode (or `upload: false`) skips upload and returns null URLs. Local
archive/replay dirs under `trailer/out/chapters/` are unchanged. The effective
`tier { resolution, targetSeconds, skipVideo? }` is echoed in the result for persistence.

## `world.brief` — grounded per-country parody briefs

`src/content-engine/worldBrief.ts` (job kind `world.brief`): ONE Gemini call with Google
Search grounding returns a current 1-2 sentence PARODY brief per requested faction (default
all 12), plus an internal `sourceNote` naming the real-world hook. RPC-fast (< 30s,
`attempts: 1`). Guardrails: satire targets institutions, never people (no real politicians);
no real armed-conflict references — rivalries are arena/mining competition only; the show's
Iran–Israel rivalry stays strictly game-world. Soft-fails to `{ briefs: [] }` without
`GEMINI_KEY` — the backend keeps its previous briefs and persists rows
(`hashiden_country_world_brief`) on its own schedule. Briefs feed back into chapters as
`ChapterCycleFacts.worldContext`.

## Acceptance simulation

`npm run demo:chapters` (part of `check:oss`) — fixture-driven, zero network/spend:

- assembles two consecutive chapters and proves chapter N+1's recap quotes chapter N's persisted cliffhanger;
- a freshly minted fixture beast appears in chapter N+1's CAST with its intro line;
- the cover prompt stages the winning country's bible location card and forbids readable text / flag clothing;
- the four epithet trigger rules derive exactly as specced;
- chapter facts compound through the canonize gate (cliffhanger becomes the rivalry arc's open question, idempotent per war);
- every produced text surface passes the banned-lexicon sweep.
