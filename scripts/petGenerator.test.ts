import assert from "node:assert/strict";
import {
  InlineArtifactStore,
  generatePetContent,
  type ImageGenerator,
  type PetImageValidator,
  type PetContentJobKind,
} from "../src/pet-content/index.js";
import {
  genesisPetPacketFixture,
  petPacketFixture,
} from "./fixtures/petPacket.js";

async function run(kind: PetContentJobKind) {
  const calls: Array<{ refs: number; aspect: string; model?: string }> = [];
  const generateImage: ImageGenerator = async (_prompt, references, options) => {
    calls.push({
      refs: references.length,
      aspect: options.aspectRatio,
      model: options.model,
    });
    return {
      buffer: Buffer.from(`fake-png-${calls.length}`),
      model: "fixture-image-model",
      requestId: `request-${calls.length}`,
    };
  };
  const progress: number[] = [];
  const result = await generatePetContent(petPacketFixture(kind), {
    store: new InlineArtifactStore(),
    generateImage,
    onProgress: (update) => {
      progress.push(update.percent);
    },
  });
  assert.equal(result.kind, kind);
  assert.equal(progress.at(-1), 100);
  assert.ok(result.artifacts.every((artifact) => artifact.base64));
  return { result, calls };
}

const mint = await run("pet.mint_art");
assert.deepEqual(mint.result.artifacts.map((artifact) => artifact.kind), ["full_body", "dp"]);
assert.deepEqual(mint.calls, [
  { refs: 0, aspect: "3:4", model: undefined },
  { refs: 1, aspect: "1:1", model: undefined },
]);

const evolution = await run("pet.evolution_art");
assert.equal(evolution.calls[0].refs, 2);

const expressions = await run("pet.expression_sheet");
assert.deepEqual(expressions.result.artifacts.map((artifact) => artifact.kind), ["expression_sheet"]);
assert.equal(Object.keys(expressions.result.expressions || {}).length, 6);

const card = await run("pet.rare_card");
assert.deepEqual(card.result.artifacts.map((artifact) => artifact.kind), ["rare_card"]);
assert.equal(card.calls[0].aspect, "4:5");

const countryCalls: Array<{ refs: number; aspect: string; model?: string }> = [];
const countryGenerateImage: ImageGenerator = async (_prompt, references, options) => {
  countryCalls.push({
    refs: references.length,
    aspect: options.aspectRatio,
    model: options.model,
  });
  return {
    buffer: Buffer.from(`country-png-${countryCalls.length}`),
    model: "fixture-country-model",
    requestId: `country-${countryCalls.length}`,
  };
};
let validationCall = 0;
const validateImage: PetImageValidator = async () => {
  validationCall += 1;
  return validationCall === 1
    ? { isValid: false, reason: "first full body missed the pose" }
    : { isValid: true, reason: "same character" };
};
const countryMint = await generatePetContent(genesisPetPacketFixture(), {
  store: new InlineArtifactStore(),
  generateImage: countryGenerateImage,
  validateImage,
  resolveMintReference: async () => ({
    buffer: Buffer.from("standing-doge-reference"),
    contentType: "image/jpeg",
    source: "fixture-standing-reference",
  }),
});
assert.deepEqual(countryCalls, [
  { refs: 1, aspect: "3:4", model: "fal-ai/nano-banana-pro/edit" },
  { refs: 1, aspect: "3:4", model: "fal-ai/nano-banana-pro/edit" },
  { refs: 1, aspect: "1:1", model: "fal-ai/nano-banana-pro/edit" },
]);
assert.equal(countryMint.mint_profile?.faction_name, "India");
assert.equal(countryMint.mint_profile?.breed_name, "Indian Pariah");
assert.equal(countryMint.mint_profile?.reference_source, "fixture-standing-reference");
assert.equal(countryMint.validation?.full_body.attempts, 2);
assert.equal(countryMint.validation?.full_body.passed, true);
assert.equal(countryMint.validation?.dp.attempts, 1);

console.log("pet generator OK");
