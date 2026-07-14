import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertPetPromptQuality,
  buildPetPromptSet,
  deriveVisualIdentity,
} from "../src/pet-content/index.js";
import { petPacketFixture } from "./fixtures/petPacket.js";

const packet = petPacketFixture("pet.evolution_art");
const first = buildPetPromptSet(packet);
const second = buildPetPromptSet(packet);
assert.deepEqual(first, second, "prompt output must be deterministic");

for (const prompt of Object.values(first)) {
  assertPetPromptQuality(prompt);
  assert.match(prompt, /70 percent cool/i);
  assert.match(prompt, /64 pixels/i);
  assert.doesNotMatch(prompt, /filmography|screenplay|feature film/i);
}

assert.match(first.full_body, /rebirth rule/i);
assert.match(first.full_body, /past-life echo/i);
assert.match(first.expression_sheet, /smug, panic, cope/i);
assert.match(first.rare_card, /reaction card/i);
assert.match(first.dp, /profile picture/i);

const identity = deriveVisualIdentity(packet);
assert.ok(identity.palette.includes(","));
assert.match(identity.signatureProp, /absurdly small chart/);
assert.equal(identity.lifeToken, "bent coin");
const nextLife = petPacketFixture("pet.evolution_art");
nextLife.identity_digest = "b2".repeat(32);
nextLife.pet.dna.comfort_item = "lucky sock";
const nextIdentity = deriveVisualIdentity(nextLife);
assert.equal(nextIdentity.palette, identity.palette);
assert.equal(nextIdentity.marking, identity.marking);
assert.equal(nextIdentity.eyes, identity.eyes);
assert.equal(nextIdentity.signatureProp, identity.signatureProp);
assert.equal(nextIdentity.lifeToken, "lucky sock");

const ascension = petPacketFixture("pet.evolution_art");
ascension.evolution_reason = "ascension";
assert.match(buildPetPromptSet(ascension).full_body, /ascension rule/i);

const visualReroll = petPacketFixture("pet.evolution_art");
visualReroll.evolution_reason = "visual_reroll";
const visualRerollPrompt = buildPetPromptSet(visualReroll).full_body;
assert.match(visualRerollPrompt, /visual reroll rule/i);
assert.match(visualRerollPrompt, /remix target/i);

const hashes = Object.fromEntries(
  Object.entries(first).map(([key, value]) => [
    key,
    createHash("sha256").update(value).digest("hex").slice(0, 16),
  ]),
);
assert.deepEqual(hashes, {
  full_body: "8cd90d6f29c7e410",
  dp: "a11267dfa9208d87",
  expression_sheet: "d4579f8c6fcb2de9",
  rare_card: "ac4a1c4b6696415b",
});

console.log("pet prompts OK");
