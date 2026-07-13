/**
 * Moment-event content — dialogue (and optionally a reaction clip) for the
 * extended moment vocabulary (moments.ts): first wins, streaks, comebacks,
 * near-misses, rival humiliations, revenge, MVP coronations, cliffhangers and
 * lootbox drama.
 *
 * Runs as the `nft.moment_content` job kind. Defaults to the CHEAP path
 * (dialogue only); `includeClip: true` opts into an identity-gated reaction
 * strip APNG.
 *
 * Stays in the backend (same boundary as every other nft.* job): the
 * economics/budget gate that decides whether this job is dispatched at all
 * (gate it exactly like nft.reroll_content), per-cycle dialogue memory
 * (previousLine threading), DDB persistence, and socket emission.
 */
import { logger } from "../utils/logger.js";
import type { BeastMemorySnapshot } from "./beastMemory.js";
import type { NftBeastInput } from "./types.js";
import {
  buildMomentDialoguePrompt,
  deriveMoment,
  momentGrammar,
  momentStripAction,
  type MomentContext,
  type MomentType,
} from "./moments.js";
import { writeAndVoiceFromPrompt, type DialogueResult } from "./rerollContent.js";
import { generateStrip, assembleLoop, resolveBeastProfile } from "./stateAnimations.js";
import {
  getDefaultArtifactStore,
  storeArtifact,
  type ArtifactStore,
  type NftArtifact,
} from "./artifacts.js";

export interface NftMomentContentInput {
  beast: NftBeastInput;
  /** Explicit moment; when omitted it is derived from `context` (deriveMoment). */
  moment?: MomentType;
  /** Typed moment inputs (streaks, rank deltas, roll vs threshold, rival id). */
  context: MomentContext;
  /** Previous dialogue line this cycle (continuity; backend-owned memory). */
  previousLine?: string;
  /** Pre-resolved voice id (skip lazy voice design). */
  voiceId?: string;
  /** Also render an identity-gated reaction clip (default false — cheap path). */
  includeClip?: boolean;
  /**
   * Per-beast story-memory snapshot (Phase D1) — epithets, technique debuts,
   * rivalry ledger, recent lines. Backend-owned; threads continuity into the
   * dialogue line. See beastMemory.ts for the contract.
   */
  memory?: BeastMemorySnapshot;
}

export interface NftMomentContentResult {
  mint: string;
  /** The moment that was rendered (explicit or derived). */
  moment: MomentType;
  dialogue?: DialogueResult;
  /** Looping reaction clip APNG, when includeClip produced one. */
  clip?: NftArtifact;
  artifacts: NftArtifact[];
}

/**
 * Produce the content bundle for one game moment. Best-effort sub-steps: a
 * failed clip or silent voice never fails the job; a non-derivable moment does.
 */
export async function generateMomentContent(
  input: NftMomentContentInput,
  opts: { store?: ArtifactStore } = {},
): Promise<NftMomentContentResult> {
  const store = opts.store || getDefaultArtifactStore();
  const beast = input.beast;
  const moment = input.moment ?? deriveMoment(input.context || {});
  if (!moment) {
    throw new Error(
      "moment_content: no moment given and none derivable from context — pass `moment` or richer context fields",
    );
  }

  const artifacts: NftArtifact[] = [];
  const result: NftMomentContentResult = { mint: beast.mint, moment, artifacts };
  const grammar = momentGrammar(moment);

  // 1. Voiced dialogue line (distinct per-moment directive + body language,
  //    rivalry continuity when the bible rival is involved).
  const prompt = buildMomentDialoguePrompt(
    beast,
    moment,
    input.context || {},
    input.previousLine,
    input.memory,
  );
  const dlg = await writeAndVoiceFromPrompt(beast, prompt, grammar.soundId, {
    store,
    voiceId: input.voiceId,
    artifactTag: `moment-${moment}`,
  });
  if (dlg) {
    result.dialogue = dlg;
    if (dlg.audio) artifacts.push(dlg.audio);
  }

  // 2. Optional reaction clip (identity-gated strip, looping).
  if (input.includeClip) {
    try {
      const profile = resolveBeastProfile(beast);
      const strip = await generateStrip(beast, momentStripAction(moment, profile, input.context));
      if (strip) {
        const apng = await assembleLoop(strip.buffer, true);
        const clip = await storeArtifact(store, {
          kind: "moment",
          key: `${beast.storagePath || `misc/${beast.mint}`}/gameplay/moment-${moment}-${Date.now()}.png`,
          buffer: apng,
          contentType: "image/png",
          model: strip.model,
          requestId: strip.requestId,
        });
        result.clip = clip;
        artifacts.push(clip);
      }
    } catch (e: any) {
      logger.warning(`moment: clip failed: ${e?.message || e}`);
    }
  }

  logger.success(
    `🎭 moment ${moment} content for ${String(beast.mint).slice(0, 8)}… clip=${result.clip ? "y" : "n"} line="${dlg?.line || ""}"`,
  );
  return result;
}
