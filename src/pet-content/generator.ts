import { PET_CONTRACT_VERSION, PET_PROMPT_VERSION } from "./catalog.js";
import type { PetContentResult, PetVisualPacket } from "./contracts.js";
import {
  getDefaultArtifactStore,
  storePetArtifact,
  type ArtifactStore,
} from "./artifacts.js";
import {
  generatePetImage,
  type GeneratedImage,
  type ImageGenerator,
  type ImageReference,
} from "./media.js";
import {
  assertCountryDpPromptQuality,
  assertCountryEvolutionPromptQuality,
  assertCountryMintPromptQuality,
  buildCountryEvolutionFullBodyPrompt,
  buildCountryMintDpPrompt,
  buildCountryMintFullBodyPrompt,
  resolveCountryMintProfile,
  resolveCountryMintReference,
  usesCountryBreedArt,
  type ResolvedMintReference,
} from "./countryMint.js";
import {
  validatePetImageIdentity,
  type PetImageComparison,
  type PetImageValidator,
} from "./identityValidation.js";
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
  validateImage?: PetImageValidator;
  resolveMintReference?: (
    packet: PetVisualPacket,
  ) => Promise<ResolvedMintReference>;
  onProgress?: PetProgressFn;
}

const MINT_MAX_RETRIES = Math.max(
  1,
  Number(
    process.env.PET_MINT_MAX_RETRIES ||
    process.env.NFT_MINT_MAX_RETRIES ||
    3,
  ),
);
const MINT_IMAGE_MODEL =
  process.env.PET_MINT_IMAGE_MODEL ||
  process.env.NFT_MINT_IMAGE_MODEL ||
  "fal-ai/nano-banana-pro/edit";

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

async function referenceBuffer(reference: ImageReference): Promise<Buffer> {
  if (reference.buffer) return reference.buffer;
  if (!reference.url) throw new Error("image reference has no buffer or URL");
  const response = await fetch(reference.url);
  if (!response.ok) throw new Error(`reference fetch returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

interface ValidatedImage {
  image: GeneratedImage;
  attempts: number;
  passed: boolean;
  reason: string;
}

async function generateValidated(
  deps: Required<PetGenerationDependencies>,
  prompt: string,
  references: ImageReference[],
  comparisonReference: Buffer,
  comparison: PetImageComparison,
  options: { aspectRatio: "1:1" | "3:4"; resolution: "1K" | "2K"; model?: string },
  onAttempt: (attempt: number) => void | Promise<void>,
): Promise<ValidatedImage> {
  let last: GeneratedImage | null = null;
  let reason = "";
  for (let attempt = 1; attempt <= MINT_MAX_RETRIES; attempt += 1) {
    await onAttempt(attempt);
    const image = await deps.generateImage(prompt, references, options);
    last = image;
    const validation = await deps.validateImage(
      comparisonReference,
      image.buffer,
      comparison,
    );
    reason = validation.reason;
    if (validation.isValid) {
      return { image, attempts: attempt, passed: true, reason };
    }
  }
  if (!last) throw new Error("pet image generation exhausted without an image");
  return {
    image: last,
    attempts: MINT_MAX_RETRIES,
    passed: false,
    reason: reason || "validation retry budget exhausted",
  };
}

async function generateBaseArt(
  packet: PetVisualPacket,
  deps: Required<PetGenerationDependencies>,
): Promise<PetContentResult> {
  const countryBreed = usesCountryBreedArt(packet);
  const fullBodyPrompt = countryBreed
    ? packet.mode === "pet.mint_art"
      ? buildCountryMintFullBodyPrompt(packet)
      : buildCountryEvolutionFullBodyPrompt(packet)
    : buildFullBodyPrompt(packet);
  const dpPrompt = countryBreed ? buildCountryMintDpPrompt() : buildDpPrompt(packet);
  if (countryBreed) {
    if (packet.mode === "pet.mint_art") assertCountryMintPromptQuality(fullBodyPrompt);
    else assertCountryEvolutionPromptQuality(fullBodyPrompt);
    assertCountryDpPromptQuality(dpPrompt);
  } else {
    assertPetPromptQuality(fullBodyPrompt);
    assertPetPromptQuality(dpPrompt);
  }

  let mintReference: ResolvedMintReference | null = null;
  let fullBodyReferences: ImageReference[] = [];
  if (countryBreed && packet.mode === "pet.mint_art") {
    mintReference = await deps.resolveMintReference(packet);
    fullBodyReferences = [{
      buffer: mintReference.buffer,
      contentType: mintReference.contentType,
    }];
  } else if (packet.mode === "pet.evolution_art") {
    fullBodyReferences = continuityReferences(packet);
    if (countryBreed && fullBodyReferences.length === 0) {
      mintReference = await deps.resolveMintReference(packet);
      fullBodyReferences = [{
        buffer: mintReference.buffer,
        contentType: mintReference.contentType,
      }];
    }
  }

  await deps.onProgress({
    step: "full_body",
    percent: 5,
    message: countryBreed ? "Drawing country-breed HashBeast" : "Drawing canonical pet",
  });
  const fullBodyValidated = countryBreed
    ? await generateValidated(
        deps,
        fullBodyPrompt,
        fullBodyReferences,
        mintReference?.buffer || await referenceBuffer(fullBodyReferences[0]),
        "full_body",
        { aspectRatio: "3:4", resolution: "1K", model: MINT_IMAGE_MODEL },
        (attempt) => deps.onProgress({
          step: "full_body",
          percent: 5 + attempt * 8,
          message: `Drawing and checking full body ${attempt}/${MINT_MAX_RETRIES}`,
        }),
      )
    : {
        image: await deps.generateImage(
          fullBodyPrompt,
          fullBodyReferences,
          { aspectRatio: "3:4", resolution: "1K" },
        ),
        attempts: 1,
        passed: true,
        reason: "country-breed validation not required",
      };
  const fullBodyArtifact = await storePetArtifact({
    store: deps.store,
    kind: "full_body",
    key: artifactKey(packet, "full_body.png"),
    image: fullBodyValidated.image,
  });

  await deps.onProgress({ step: "dp", percent: 55, message: "Drawing same-character NFT DP" });
  const dpReferences = [{
    buffer: fullBodyValidated.image.buffer,
    contentType: "image/png",
  }];
  const dpValidated = countryBreed
    ? await generateValidated(
        deps,
        dpPrompt,
        dpReferences,
        fullBodyValidated.image.buffer,
        "dp",
        { aspectRatio: "1:1", resolution: "1K", model: MINT_IMAGE_MODEL },
        (attempt) => deps.onProgress({
          step: "dp",
          percent: 55 + attempt * 8,
          message: `Drawing and checking NFT DP ${attempt}/${MINT_MAX_RETRIES}`,
        }),
      )
    : {
        image: await deps.generateImage(
          dpPrompt,
          dpReferences,
          { aspectRatio: "1:1", resolution: "1K" },
        ),
        attempts: 1,
        passed: true,
        reason: "country-breed validation not required",
      };
  const dpArtifact = await storePetArtifact({
    store: deps.store,
    kind: "dp",
    key: artifactKey(packet, "dp.png"),
    image: dpValidated.image,
  });
  await deps.onProgress({ step: "completed", percent: 100 });

  const result: PetContentResult = {
    ...resultBase(packet),
    prompts: { full_body: fullBodyPrompt, dp: dpPrompt },
    artifacts: [fullBodyArtifact, dpArtifact],
  };
  if (countryBreed) {
    const mint = resolveCountryMintProfile(packet);
    result.mint_profile = {
      faction_id: mint.resolved.faction.id,
      faction_code: mint.resolved.faction.code,
      faction_name: mint.resolved.faction.name,
      breed_value: mint.decoded.breed,
      breed_name: mint.resolved.breed.name,
      type_value: mint.decoded.type,
      occupation: mint.resolved.type.occupation,
      reference_source:
        mintReference?.source || "canonical-continuity-art",
    };
    result.validation = {
      full_body: {
        attempts: fullBodyValidated.attempts,
        passed: fullBodyValidated.passed,
        reason: fullBodyValidated.reason,
      },
      dp: {
        attempts: dpValidated.attempts,
        passed: dpValidated.passed,
        reason: dpValidated.reason,
      },
    };
  }
  return result;
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
    validateImage: dependencies.validateImage || validatePetImageIdentity,
    resolveMintReference:
      dependencies.resolveMintReference || resolveCountryMintReference,
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
