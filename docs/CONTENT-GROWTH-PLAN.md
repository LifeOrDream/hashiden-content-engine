# Content Growth Plan — Audit + Roadmap

> Producer-level audit of the full video/content generation system (trailer pipeline,
> showrunner reels, NFT mutation content, sound, captions, dashboard) and the macro
> plan to turn it from "one good story format" into a multi-format social growth
> machine. Written 2026-06-11 after a full code audit of `ai-content-engine` and
> `MineBtcBackend`.

---

## 1. What we have today (system map)

Three production lines share one model stack (nano-banana-2/pro for stills, Seedance 2.0
for video, MiniMax voice-design + speech-02-hd for voice, sync-lipsync/v2, Stable Audio
for music/SFX, Claude/Gemini for writing):

| Line | Where | Output | State |
|---|---|---|---|
| **Trailer pipeline** | `ai-content-engine/trailer/` | 16:9 launch trailers, ~80s, 6-pass screenplay → Seedance timeline → assemble | Strongest writing system; manual blueprints; 16:9 only |
| **Showrunner** | `hashiden-backend/src/services/showrunner/` | Auto story reels (9:16 ~90s), feature videos (16:9/1:1 ~150s), episode scenes, cycle recaps, chapters | Live, budget-gated, weakest screenplay prompts |
| **NFT pipeline** | `ai-content-engine/src/nft-pipeline/` + backend services | Mint art, state-loop APNGs, mutation clips + voiced one-liners | Live (recently hardened) |

Supporting systems: dialogue quality linter (2.3 w/s budget, banned pitch-deck phrases,
score gate 70), content budget with circuit breaker (normal→economy→mock→paused),
economics rollup/simulator, webui generation dashboard (blueprints → passes → render →
inspect), admin ops dashboard, per-platform social copy + SRT sidecars.

**What is genuinely good (do not rewrite):**
- The trailer pipeline's engagement canon (`trailer/style/engagement.ts`): dopamine
  ladder (L1 stun → L6 serial promise), LOOP bookkeeping (every shot opens/raises/
  head-fakes/closes a question), hook formulas, subtext "line doctor", screen/mouth
  split. This is real screenwriting craft — the problem is only that **one** pipeline
  uses it.
- The budget/economics layer. Nothing else like it; keep it wrapped around everything new.
- Character canon (voices per faction×breed×stage, personality blocks, story memory).

---

## 2. The honest audit (producer / screenwriter / music-producer / growth lens)

### A. Format monoculture — the #1 gap
Everything we ship is the same genre: **narrative dialogue drama**. `VideoFormat` only
varies aspect/duration/shot-count, not *genre*. Social feeds reward variety and
repeatable formats; we have zero of: music videos, beat-cut edits ("vibes"), dance/
celebration loops, POV meme skits, split-screen face-offs, lore mini-docs, sports-center
recaps. Different viewers binge different formats; one format = one audience ceiling.

### B. Hooks exist on paper, not as an engineered system
The trailer pipeline demands a 1–2s stun and the reel prompt says "COLD OPEN". But:
no hook *variants* are generated and compared; no platform-specific hooks; the first
frame is not explicitly designed as the poster frame (on Reels/TikTok the first frame
IS the thumbnail); no mid-video pattern interrupts are enforced for the 9:16 reels
(retention is won every 2–4 seconds, not just at second 1).

### C. Captions/overlays are a fraction of what socials need
We burn sparse ALL-CAPS fact captions (good discipline) and write SRT sidecars. Missing
entirely: **word-level karaoke captions** (most viewers watch muted — this is the
single highest-ROI change), styled caption presets, and the **engagement-bait overlay
layer** ("wait for the end…", "POV: your country is losing the mine", "send this to
your USA friend", "part 3 of the war") — programmed text that tells the viewer what to
feel/do. These are a separate text track from story captions and need their own writer
pass.

### D. Music is an afterthought, not a driver
One Stable Audio instrumental bed (max 47s) ducked at 0.16 under everything; cuts do
not land on beats; no music-first formats; no vocal/anthem generation; no LUFS
normalization per platform. On socials, audio carries ≥50% of the dopamine. A "music
video" format is impossible in the current architecture because the track must come
*first* and the edit must be cut *to* it.

### E. Two script systems, the better one in the wrong place
The 6-pass system (engagement → dialogue → polish → direct → compile → frames) only
serves manual trailer blueprints. The *automated* high-volume line (story reels) uses a
single-pass prompt + lint retry. So our most-shipped content gets our weakest writing.

### F. Vertical is a crop, not a craft
Trailers are 16:9-locked; reels are 9:16-native but features get center-cropped
variants. No safe-zone awareness (TikTok/Reels UI chrome eats the bottom ~15% and right
edge), no vertical-native framing language in prompts for the trailer line.

### G. No feedback loop = flying blind
Nothing measures performance. No posting integration, no per-video view/retention
tracking, no format/hook win-rate ledger, no A/B. "Drive maximum views" is an
optimization problem — we currently have no gradient to follow.

### H. Emotion range is narrow
TTS emotion maps to 5 buckets; no per-video emotional arc plan; lipsync is heuristic;
reaction shots (the cheapest comedy/emotion device) are not a first-class shot type.

### I. Dashboard is an engineer console, not a producer console
webui can launch passes and inspect artifacts (good bones, real QA tab), but: no genre
picker, no hook variant comparison, no caption-style preview, no phone-frame 9:16
preview, no music audition, no publish/schedule workflow, no performance board.

---

## 3. Macro strategy

1. **One brain, many bodies.** Keep a single screenplay/engagement brain (the 6-pass
   canon) and make *genre* a first-class input that swaps beat structure, music
   strategy, caption strategy, and assembly recipe. Don't fork pipelines per format.
2. **Audio-first for half the formats.** Generate/select the track first, extract beat
   grid, then cut visuals to beats. This unlocks music videos, edits, dance loops.
3. **Muted-viewing first.** Karaoke captions + overlay text + first-frame poster design
   make every video legible with sound OFF; sound then upgrades the experience.
4. **Hooks as a generated, selectable asset.** Every video gets N hook candidates
   (script + first-frame); operator (later: data) picks the winner.
5. **Close the loop.** Post → measure → attribute → feed format/hook win-rates back
   into planning. Even manual-posting + manual metrics entry beats nothing.
6. **Volume with floors.** The existing budget breaker stays the spend governor; new
   formats get cost tiers (a caption-driven meme skit costs ~$1; a music video ~$8–15).

---

## 4. The format menu (target: 8 genres)

| # | Genre | Pattern it copies | Core recipe | Cost |
|---|---|---|---|---|
| 1 | **Story episode** | serialized mini-drama | existing 6-pass | exists |
| 2 | **Faction anthem / music video** | music-video edits | vocal track gen → beat-grid → lyric-timed cuts of beasts/war shots → karaoke lyrics | $$ |
| 3 | **Vibe edit** | "edit" culture, AMV-style | 15–30s, trending-audio-ready silent master + generated track variant; hardest cuts on beats; clip pool from existing renders (cheap reuse!) | $ |
| 4 | **Win dance / celebration loop** | dance/loop memes | 5–10s seamless loop of a beast celebration (boomerang APNG craft we already have, video-grade), overlay bait text | $ |
| 5 | **POV meme skit** | POV/caption-driven skits | 1–2 shots, caption carries the joke, dialogue optional | $ |
| 6 | **Face-off / trash talk** | versus split-screens | two beasts, split or shot/counter-shot, rivalry one-liners (gameplayScreenwriter already writes these) | $ |
| 7 | **Lore drop mini-doc** | mini-doc/storytime voiceover | single narrator VO over cinematic stills + slow push-ins (Ken Burns), karaoke captions | $ |
| 8 | **War report / recap** | sports-center highlights | cycle results as breathless ESPN-style recap; data overlays; fast | $ |

Each genre = a `GenreSpec`: beat template, hook patterns, music mode (bed | track-first |
silent-master), caption mode (karaoke | bait | sparse), duration band, assembly recipe,
cost tier, platform targets.

---

## 5. Workstreams + full change list

### WS-A: Genre/format system (P0)
- [ ] `src/content-engine/genres.ts` — `GenreSpec` registry (the 8 above), each with
      beat-sheet template injected into pass 1 / screenplay prompt, music mode, caption
      mode, assembly recipe id.
- [ ] Extend `VideoFormat` (`src/content-engine/types.ts`) with `genreId`; thread
      through `write_screenplay` job contract + backend `contentEngineClient`.
- [ ] Per-genre assembly recipes in `trailer/generate/assemble.ts` + backend
      `reelAssembly.ts` (beat-cut concat, loop export, split-screen composite,
      Ken-Burns stills mode).
- [ ] Showrunner scheduler (`storyReel.service.ts` cadence) rotates genres instead of
      always producing story reels; weights configurable, later data-driven.
- [ ] Clip-pool index: catalogue every rendered sequence/clip (we already store them in
      S3 + ContentVideo) with tags (beast, faction, action, emotion) so cheap formats
      (vibe edit, recap) can be cut **entirely from existing footage** at near-zero
      marginal cost.

### WS-B: Hook engine (P0)
- [ ] New pass 1.5 "hooks": generate 3–5 hook candidates per video (first-line +
      first-shot description + overlay text), each tagged with formula used (question
      gap / X&Y / but-pivot / visual stun / bait).
- [ ] First-frame = poster-frame rule in pass 6 + storyboard service: frame 1 must
      survive as a thumbnail (face, conflict, readable at 20% size); generate it at 2K.
- [ ] Pattern-interrupt lint for 9:16: flag any 4s window with no cut/FX/overlay/zoom
      event in the compiled timeline (extend `dialogueQuality.ts` into a
      `retentionLint.ts`).
- [ ] Platform hook variants: same video, alternate first 2s + overlay for TikTok vs
      Shorts vs X (X autoplays muted in-feed → text-forward hooks).

### WS-C: Captions + overlay text system (P0 — cheapest, highest impact)
- [ ] Word-level karaoke captions: we already have dialogue text + TTS audio; add
      forced alignment (whisper-timestamped or fal equivalent) → word timings → ASS
      subtitle render via ffmpeg (libass) with 2–3 styled presets (bold center bounce,
      clean lower-third, meme white-on-black). Apply to reels + lore docs + anthems.
- [ ] Engagement-overlay writer: small LLM pass producing 0–2 bait overlays per video
      from a curated pattern library ("wait for it", "send this to…", "part N", "POV:",
      "the ending is personal") with placement windows; render as separate drawtext/ASS
      track. Keep the existing screen/mouth-split rule: bait overlays ≠ fact captions.
- [ ] End-card variants per platform (follow CTA for TikTok, subscribe for YT, $ticker
      for X) — extend `endCard.service.ts`.
- [ ] LUFS normalization (-14 streaming target) + true-peak limit in every assembly
      path (one ffmpeg loudnorm pass).

### WS-D: Music & sound upgrade (P1)
- [ ] Track-first mode: generate full-length vocal/instrumental track (fal music models
      — evaluate minimax-music / ace-step for vocals+lyrics; Stable Audio stays for
      beds/SFX), store lyrics + structure.
- [ ] Beat grid extraction (librosa onset/beat in a small python helper, same pattern
      as `assemble_anim.py`) → cut list snapped to beats in beat-cut recipes; risers/
      whooshes from a curated SFX pack land on section transitions.
- [ ] Faction anthem library: one anthem per country (12 total, one-time cost),
      reused across that faction's videos = sonic identity + meme-ability.
- [ ] Silent-master export per video (for posting with platform trending audio) +
      music-bed master.
- [ ] SFX pack curation: build `trailer/assets/sfx/` library (whoosh, impact, riser,
      coin, bark pack) — local files are free vs $0.2/gen.

### WS-E: Vertical-native + packaging (P0/P1)
- [ ] 9:16-native trailer mode: vertical framing language in pass 4/6 prompts, Seedance
      9:16 generation (it supports it), safe-zone overlay guides (bottom 15% / right
      8%) respected by caption renderer.
- [ ] Smart reframe for catalog 16:9 → 9:16 (subject-tracking crop, not center crop) —
      even a simple "face/subject bbox from Gemini per shot → crop keyframes" pass.
- [ ] Packaging service: per-platform title/caption/hashtags already exist
      (`socialCopy.service.ts`) — add cover/poster export + 3 title variants for YT.

### WS-F: One writing brain (P1)
- [ ] Port the engagement canon (dopamine ladder, LOOP bookkeeping, polish lenses) from
      `trailer/style/*` into shared `src/content-engine/` modules consumed by BOTH the
      6-pass trailer pipeline and the showrunner `write_screenplay` job (compressed
      2-pass version for cost: engagement+dialogue combined, then polish+lint).
- [ ] Genre-aware beat templates replace the generic "HOOK → escalation → payoff" line
      in `scenePrompts.ts` / `screenplay.ts`.
- [ ] Emotional arc field on Screenplay (per-shot emotion target) → drives TTS emotion,
      Seedance performance tells, music intensity curve. Add reaction-shot as an
      explicit shot type.

### WS-G: Producer console (P1)
Upgrade `webui` from engineer console → producer console:
- [ ] Genre + platform picker on RunLauncher; cost preview before launch (cost model
      already exists — surface it pre-run, not post-run).
- [ ] Hook picker: render the 3–5 hook candidates (text + first-frame thumb), operator
      selects before full render.
- [ ] Phone-frame 9:16 preview player with safe-zone overlay; caption style live preview.
- [ ] Music audition: waveform + beat markers, pick/regen track before render.
- [ ] Variant compare (A/B side-by-side player).
- [ ] Publish tab: per-platform package (file + copy + cover), mark-as-posted with URL,
      schedule list. (Auto-posting: X API + YouTube API first — both feasible; TikTok/IG
      via official APIs need app review — start manual-with-checklist.)
- [ ] Performance board: paste/auto-pull views/likes/retention per posted video →
      win-rate by genre/hook formula → shown next to genre weights.

### WS-H: Feedback loop (P1/P2)
- [ ] `ContentPost` table (platform, url, video id, genre, hook formula, posted_at).
- [ ] Metrics ingestion: YouTube Data API + X API automated; TikTok/IG manual entry in
      webui (CSV paste) until API access.
- [ ] Weekly rollup: genre/hook win-rates → recommended scheduler weights (surfaced in
      admin + webui; human approves changes initially).

### WS-I: Performance & polish (P2)
- [ ] Lipsync coverage rule: every dialogue close-up gets sync unless flagged; batch
      QA report of un-synced talking shots.
- [ ] Multi-emotion TTS: map delivery notes to MiniMax vocal params (speed/pitch) not
      just 5 emotion buckets; per-character speech-rate identity.
- [ ] Subtitle sidecars (.srt/.vtt) populated for ALL pipelines (trailer one is
      currently stubbed).
- [ ] Dialogue-score + retention-lint surfaced as publish gates (warn, not block).

### Ops guardrails (cross-cutting)
- [ ] Cost-model entries for each new genre (extend `contentCostModel.ts`); breaker
      tiers map genres to economy fallbacks (vibe edit from clip pool = the "economy"
      version of a music video).
- [ ] Run-manifest cost + quality fields populated for showrunner line, not just
      trailer line.

---

## 6. Sequencing (suggested)

**Sprint 1 (P0 quick wins, mostly cheap):** WS-C karaoke captions + overlay writer +
loudnorm; WS-B first-frame poster rule + hook candidates pass; WS-A GenreSpec skeleton
+ 2 cheap genres that reuse existing footage (vibe edit, war report); silent-master
export.

**Sprint 2:** WS-A remaining genres (face-off, POV skit, win-dance loop); WS-E
9:16-native trailer mode; WS-G genre picker + hook picker + phone preview.

**Sprint 3:** WS-D track-first music + beat-cut assembly + faction anthems → ship the
first music video; WS-F engagement canon port into reel screenplays.

**Sprint 4:** WS-G publish tab + WS-H feedback loop; then let data start steering
genre weights.

---

## 7. What we deliberately do NOT change

- The 6-pass trailer engine's craft canon (extend, don't rewrite).
- The budget/economics breaker architecture (every new format plugs into it).
- Model stack (Seedance/nano-banana/MiniMax/Stable Audio) — upgrades are config swaps
  already; the bottleneck is format/packaging, not raw model quality.
- The screen/mouth split + sparse fact-caption discipline (bait overlays are an
  *additional* track, not a license to spam text).
