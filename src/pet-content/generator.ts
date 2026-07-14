import { PET_CONTRACT_VERSION, PET_PROMPT_VERSION } from "./catalog.js";
import type { PetContentResult, PetVisualPacket } from "./contracts.js";
import {
  getDefaultArtifactStore,
  storePetArtifact,
  type ArtifactStore,
} from "./artifacts.js";
import {
  generatePetImage,
  type ImageGenerator,
  type ImageReference,
} from "./media.js";
import {
  assertPetPromptQuality,
  buildDpPrompt,
  buildExpressionSheetPrompt,
  buildFullBodyPrompt,
  buildRareCardPrompt,
} from "./prompts.js";

export interface PetGenerationProgress {
  step: string;
  percent: number;
  message?: string;
}

export type PetProgressFn = (
  update: PetGenerationProgress,
) => void | Promise<void>;

export interface PetGenerationDependencies {
  store?: ArtifactStore;
  generateImage?: ImageGenerator;
  onProgress?: PetProgressFn;
}

const EXPRESSIONS: Record<string, string> = {
  smug: "grid:r1c1",
  panic: "grid:r1c2",
  cope: "grid:r1c3",
  hype: "grid:r2c1",
  sleepy: "grid:r2c2",
  locked_in: "grid:r2c3",
};

function safePath(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function artifactKey(packet: PetVisualPacket, filename: string): string {
  const life = safePath(packet.life_id).slice(-96);
  return `pets/${packet.mint}/lives/${life}/v${packet.art_version}/${filename}`;
}

function resultBase(packet: PetVisualPacket): Omit<PetContentResult, "prompts" | "artifacts"> {
  return {
    contract_version: PET_CONTRACT_VERSION,
    kind: packet.mode,
    mint: packet.mint,
    life_id: packet.life_id,
    identity_digest: packet.identity_digest,
    art_version: packet.art_version,
    stage: packet.pet.stage,
    prompt_version: PET_PROMPT_VERSION,
  };
}

function continuityReferences(packet: PetVisualPacket): ImageReference[] {
  const urls = [packet.continuity.full_body_url, packet.continuity.dp_url]
    .filter((value): value is string => Boolean(value));
  return urls.slice(0, 2).map((url) => ({ url }));
}

async function generateBaseArt(
  packet: PetVisualPacket,
  deps: Required<PetGenerationDependencies>,
): Promise<PetContentResult> {
  const fullBodyPrompt = buildFullBodyPrompt(packet);
  const dpPrompt = buildDpPrompt(packet);
  assertPetPromptQuality(fullBodyPrompt);
  assertPetPromptQuality(dpPrompt);

  await deps.onProgress({ step: "full_body", percent: 5, message: "Drawing canonical pet" });
  const fullBody = await deps.generateImage(
    fullBodyPrompt,
    packet.mode === "pet.evolution_art" ? continuityReferences(packet) : [],
    { aspectRatio: "3:4", resolution: "1K" },
  );
  const fullBodyArtifact = await storePetArtifact({
    store: deps.store,
    kind: "full_body",
    key: artifactKey(packet, "full_body.png"),
    image: fullBody,
  });

  await deps.onProgress({ step: "dp", percent: 55, message: "Cropping iconic PFP" });
  const dp = await deps.generateImage(
    dpPrompt,
    [{ buffer: fullBody.buffer, contentType: "image/png" }],
    { aspectRatio: "1:1", resolution: "1K" },
  );
  const dpArtifact = await storePetArtifact({
    store: deps.store,
    kind: "dp",
    key: artifactKey(packet, "dp.png"),
    image: dp,
  });
  await deps.onProgress({ step: "completed", percent: 100 });

  return {
    ...resultBase(packet),
    prompts: { full_body: fullBodyPrompt, dp: dpPrompt },
    artifacts: [fullBodyArtifact, dpArtifact],
  };
}

async function generateExpressionSheet(
  packet: PetVisualPacket,
  deps: Required<PetGenerationDependencies>,
): Promise<PetContentResult> {
  const reference = packet.continuity.dp_url || packet.continuity.full_body_url;
  if (!reference) throw new Error("expression sheet requires canonical pet art");
  const prompt = buildExpressionSheetPrompt(packet);
  assertPetPromptQuality(prompt);
  await deps.onProgress({ step: "expression_sheet", percent: 10 });
  const image = await deps.generateImage(prompt, [{ url: reference }], {
    aspectRatio: "3:4",
    resolution: "1K",
  });
  const artifact = await storePetArtifact({
    store: deps.store,
    kind: "expression_sheet",
    key: artifactKey(packet, "expression_sheet.png"),
    image,
  });
  await deps.onProgress({ step: "completed", percent: 100 });
  return {
    ...resultBase(packet),
    prompts: { expression_sheet: prompt },
    artifacts: [artifact],
    expressions: EXPRESSIONS,
  };
}

async function generateRareCard(
  packet: PetVisualPacket,
  deps: Required<PetGenerationDependencies>,
): Promise<PetContentResult> {
  const reference = packet.continuity.dp_url || packet.continuity.full_body_url;
  if (!reference) throw new Error("rare card requires canonical pet art");
  if (!packet.rare_moment) throw new Error("rare card requires rare_moment");
  const prompt = buildRareCardPrompt(packet);
  assertPetPromptQuality(prompt);
  await deps.onProgress({ step: "rare_card", percent: 10 });
  const image = await deps.generateImage(prompt, [{ url: reference }], {
    aspectRatio: "4:5",
    resolution: "1K",
  });
  const event = safePath(packet.rare_moment.event_id).slice(-64) || "moment";
  const artifact = await storePetArtifact({
    store: deps.store,
    kind: "rare_card",
    key: artifactKey(packet, `rare_cards/${event}.png`),
    image,
  });
  await deps.onProgress({ step: "completed", percent: 100 });
  return {
    ...resultBase(packet),
    prompts: { rare_card: prompt },
    artifacts: [artifact],
  };
}

export async function generatePetContent(
  packet: PetVisualPacket,
  dependencies: PetGenerationDependencies = {},
): Promise<PetContentResult> {
  const deps: Required<PetGenerationDependencies> = {
    store: dependencies.store || getDefaultArtifactStore(),
    generateImage: dependencies.generateImage || generatePetImage,
    onProgress: dependencies.onProgress || (() => undefined),
  };
  switch (packet.mode) {
    case "pet.mint_art":
    case "pet.evolution_art":
      return generateBaseArt(packet, deps);
    case "pet.expression_sheet":
      return generateExpressionSheet(packet, deps);
    case "pet.rare_card":
      return generateRareCard(packet, deps);
  }
}
