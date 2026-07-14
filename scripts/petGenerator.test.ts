import assert from "node:assert/strict";
import {
  InlineArtifactStore,
  generatePetContent,
  type ImageGenerator,
  type PetContentJobKind,
} from "../src/pet-content/index.js";
import { petPacketFixture } from "./fixtures/petPacket.js";

async function run(kind: PetContentJobKind) {
  const calls: Array<{ refs: number; aspect: string }> = [];
  const generateImage: ImageGenerator = async (_prompt, references, options) => {
    calls.push({ refs: references.length, aspect: options.aspectRatio });
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
assert.deepEqual(mint.calls, [{ refs: 0, aspect: "3:4" }, { refs: 1, aspect: "1:1" }]);

const evolution = await run("pet.evolution_art");
assert.equal(evolution.calls[0].refs, 2);

const expressions = await run("pet.expression_sheet");
assert.deepEqual(expressions.result.artifacts.map((artifact) => artifact.kind), ["expression_sheet"]);
assert.equal(Object.keys(expressions.result.expressions || {}).length, 6);

const card = await run("pet.rare_card");
assert.deepEqual(card.result.artifacts.map((artifact) => artifact.kind), ["rare_card"]);
assert.equal(card.calls[0].aspect, "4:5");

console.log("pet generator OK");
