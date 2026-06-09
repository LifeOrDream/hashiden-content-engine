import {
  beatText,
  buildCharacterReferenceBlock,
  buildDirectorPromptBlock,
  buildNegativeVisualPrompt,
  buildSceneKeyframePrompt,
  buildSceneScriptPrompt,
  buildScreenplayPrompt,
  buildVideoMotionRulesBlock,
  isSceneWorthy,
  normalizeScreenplayFromRawText,
  pickTrope,
  scoreBeat,
  tropeForPulse,
} from "../content-engine/index.js";
import type {
  ContentEngineJobKind,
  ContentEngineJobPayload,
  ContentEngineJobResultMap,
  WriteSceneScriptResult,
} from "./contracts.js";
import { generateText, parseJsonLoose } from "./llm.js";

function parseSceneScript(rawText: string): WriteSceneScriptResult | null {
  const parsed = parseJsonLoose<any>(rawText);
  if (!parsed || (!parsed.scene && !parsed.dialogue)) return null;
  return {
    scene: String(parsed.scene || "").trim(),
    dialogue: String(parsed.dialogue || "").trim(),
    caption: String(parsed.caption || "").trim(),
    rawText,
  };
}

export async function processContentEngineJob<K extends ContentEngineJobKind>(
  payload: ContentEngineJobPayload<K>,
): Promise<ContentEngineJobResultMap[K]> {
  switch (payload.kind) {
    case "plan_event": {
      const input = payload.input as ContentEngineJobPayload<"plan_event">["input"];
      const kind = input.event.kind;
      const text = beatText(kind, input.factionName, input.event);
      const worth = scoreBeat(kind, input.role, input.arc);
      const trope = pickTrope(kind, input.role, input.arc);
      const sceneWorthy = isSceneWorthy(
        kind,
        input.episodeLike,
        input.quietMs,
        input.nowMs,
      );
      return { text, worth, trope, sceneWorthy } as ContentEngineJobResultMap[K];
    }
    case "plan_pulse": {
      const input = payload.input as ContentEngineJobPayload<"plan_pulse">["input"];
      return { trope: tropeForPulse(input.theme) } as ContentEngineJobResultMap[K];
    }
    case "write_screenplay": {
      const input = payload.input as ContentEngineJobPayload<"write_screenplay">["input"];
      const prompt = buildScreenplayPrompt(input.grounding, input.format);
      const rawText = await generateText(prompt, { temperature: 0.78, json: true });
      const screenplay = normalizeScreenplayFromRawText(
        rawText,
        input.grounding,
        input.format,
      );
      return { screenplay, rawText } as ContentEngineJobResultMap[K];
    }
    case "write_scene_script": {
      const input = payload.input as ContentEngineJobPayload<"write_scene_script">["input"];
      const prompt = buildSceneScriptPrompt(input.promptInput);
      const rawText = await generateText(prompt, { temperature: 0.82, json: true });
      const parsed = parseSceneScript(rawText);
      if (!parsed) throw new Error("scene script LLM returned invalid JSON");
      return parsed as ContentEngineJobResultMap[K];
    }
    case "build_scene_keyframe_prompt": {
      const input = payload.input as ContentEngineJobPayload<"build_scene_keyframe_prompt">["input"];
      return {
        prompt: buildSceneKeyframePrompt(input.promptInput),
      } as ContentEngineJobResultMap[K];
    }
    case "build_character_reference_block": {
      const input = payload.input as ContentEngineJobPayload<"build_character_reference_block">["input"];
      return {
        text: buildCharacterReferenceBlock(input.hashBeast, input.label),
      } as ContentEngineJobResultMap[K];
    }
    case "build_director_prompt_block": {
      const input = payload.input as ContentEngineJobPayload<"build_director_prompt_block">["input"];
      return {
        text: buildDirectorPromptBlock(input.format || { aspectRatio: "9:16" }),
      } as ContentEngineJobResultMap[K];
    }
    case "build_negative_visual_prompt":
      return { text: buildNegativeVisualPrompt() } as ContentEngineJobResultMap[K];
    case "build_video_motion_rules_block": {
      const input = payload.input as ContentEngineJobPayload<"build_video_motion_rules_block">["input"];
      return {
        text: buildVideoMotionRulesBlock(input.format || { aspectRatio: "9:16" }),
      } as ContentEngineJobResultMap[K];
    }
    default:
      throw new Error(`Unknown content-engine job kind: ${(payload as any)?.kind}`);
  }
}
