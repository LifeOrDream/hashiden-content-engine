/**
 * Prompt-trait_map block rendering + purity gates (Spec Part C).
 *
 * The backend owns the beast's off-chain "prompt trait_map" (distilled lineage:
 * motif line, motivation, past-life echoes, aesthetic tokens, arc stage). It
 * hands the engine a pre-rendered pair on every snapshot:
 *
 *   traitMapBlock = { forText, forImage }
 *
 * - `forText`  — the FULL distilled trait_map (motif prose, motivation, epithets,
 *                technique names allowed). Renders into TEXT surfaces only:
 *                personality directives, dialogue prompts, scene-script
 *                contextPromptBlocks, keyframe canonBlocks that describe story.
 * - `forImage` — a STRIPPED variant (aesthetic tokens + arc stage ONLY). It
 *                feeds character-reference / keyframe IMAGE prompts. It must
 *                NEVER carry technique names, epithet names, or motif prose:
 *                the text-free-image rule and the identity gates depend on
 *                images being described by look, not by named lore.
 *
 * The backend is the primary author of both variants, but the engine is the
 * last line of defence: `sanitizeTraitMapForImage` defensively scrubs any
 * technique/epithet/motif contamination before an image prompt is emitted, so
 * a backend regression can never leak lore into a picture.
 */
import { allTechniqueNames } from "../world/progression.js";

export interface TraitMapBlock {
  /** Full distilled trait_map — text/dialogue surfaces only. */
  forText: string;
  /** Stripped aesthetic-tokens + stage variant — image surfaces only. */
  forImage: string;
  /**
   * When the distilled motivation was driven by a sealed whisper intent, the
   * backend stamps its opaque reference here (the same string the distiller
   * returns as `honored_intent_ref`). Dialogue prompts are told to honor it,
   * and the dialogue result echoes it back so the backend can attach the quill
   * mark. Purely a text-surface signal — never rendered into an image.
   */
  honoredIntentRef?: string;
}

/** Hard caps mirroring the backend distiller output (defence in depth). */
export const TRAIT_MAP_FOR_TEXT_MAX = 900;
export const TRAIT_MAP_FOR_IMAGE_MAX = 300;

/**
 * Motif-prose / lore markers that must never appear in an IMAGE prompt. These
 * are the section labels the backend forText variant uses ("motif:",
 * "motivation:", "past life:", "echo:") plus the "epithet" keyword — image
 * prompts describe LOOK, never named story.
 */
const MOTIF_PROSE_MARKERS = [
  /\bmotif\b/i,
  /\bmotivation\b/i,
  /\bpast[- ]?life\b/i,
  /\bpast[- ]?lives\b/i,
  /\becho(?:es)?\b/i,
  /\bepithet\b/i,
  /\bsworn\b/i,
  /\bavenge\b/i,
  /\bgrudge\b/i,
  /\bhonou?r(?:ing|ed)?\b/i,
];

/** Lowercased cache of the named-technique lexicon (country × lane moves). */
let TECHNIQUE_NAME_CACHE: string[] | null = null;
function techniqueNamesLower(): string[] {
  if (!TECHNIQUE_NAME_CACHE) {
    TECHNIQUE_NAME_CACHE = allTechniqueNames()
      .map((n) => String(n || "").trim().toLowerCase())
      .filter((n) => n.length >= 3);
  }
  return TECHNIQUE_NAME_CACHE;
}

/**
 * Does `text` violate the forImage purity contract? Returns the list of
 * offending reasons ([] = clean). Used by the acceptance tests and by the
 * defensive sanitizer.
 */
export function traitMapImagePuritySmells(text: string): string[] {
  const t = String(text || "");
  const lower = t.toLowerCase();
  const smells: string[] = [];
  for (const marker of MOTIF_PROSE_MARKERS) {
    if (marker.test(t)) smells.push(`motif/lore prose in image prompt: ${marker.source}`);
  }
  for (const name of techniqueNamesLower()) {
    if (lower.includes(name)) smells.push(`technique name in image prompt: "${name}"`);
  }
  return Array.from(new Set(smells));
}

/**
 * Defensive scrub of a forImage trait_map variant: drops any line/clause that
 * carries a technique name, epithet keyword, or motif-prose marker. Never
 * throws — worst case it returns "". Applied automatically wherever the engine
 * renders a trait_map into an IMAGE prompt.
 */
export function sanitizeTraitMapForImage(forImage: string | undefined): string {
  const raw = String(forImage || "").slice(0, TRAIT_MAP_FOR_IMAGE_MAX);
  if (!raw.trim()) return "";
  // Split into clause-ish fragments so one bad token drops only its own clause,
  // not the whole aesthetic-token list.
  const fragments = raw.split(/[\n;,]+/);
  const clean = fragments
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && traitMapImagePuritySmells(f).length === 0);
  return clean.join(", ").slice(0, TRAIT_MAP_FOR_IMAGE_MAX);
}

/**
 * The forText trait_map directive rendered next to the owner-profile block inside
 * personality directives + dialogue prompts. Returns "" when absent.
 */
export function traitMapTextDirective(block: TraitMapBlock | undefined): string {
  const forText = String(block?.forText || "").trim().slice(0, TRAIT_MAP_FOR_TEXT_MAX);
  if (!forText) return "";
  return `PROMPT TRAIT_MAP (this beast's distilled lineage — honor its motif, motivation and past-life echoes; never contradict hard on-chain facts): ${forText}`;
}

/**
 * The forImage trait_map block rendered into character-reference / keyframe IMAGE
 * prompts. Aesthetic tokens + arc stage ONLY — defensively sanitized so no
 * technique/epithet name or motif prose can leak into a picture. Returns ""
 * when absent or when sanitizing leaves nothing.
 */
export function traitMapImageBlock(block: TraitMapBlock | undefined): string {
  const clean = sanitizeTraitMapForImage(block?.forImage);
  if (!clean) return "";
  return `TRAIT_MAP AESTHETIC (visual palette + arc stage cues only — render these as look, never as text): ${clean}`;
}

/**
 * When the beast's distilled motivation derives from a sealed whisper intent,
 * instruct the dialogue model to honor it and (for structured surfaces) surface
 * the ref back. On the plain-line dialogue path the ref itself is echoed back
 * by the caller from the snapshot; this directive just keeps the line faithful
 * to the whispered intent. Returns "" when no intent is sealed.
 */
export function traitMapHonorIntentDirective(block: TraitMapBlock | undefined): string {
  const ref = String(block?.honoredIntentRef || "").trim();
  if (!ref) return "";
  return `HONORED INTENT: the beast's owner sealed a whisper that now drives its motivation — let THIS line visibly honor that intent (it is already distilled into the trait_map motivation above; do not quote the owner verbatim). The system will attach the honoring quill mark.`;
}

/** The intent ref to echo back on a dialogue result (or undefined). */
export function honoredIntentRefOf(block: TraitMapBlock | undefined): string | undefined {
  const ref = String(block?.honoredIntentRef || "").trim();
  return ref ? ref : undefined;
}
