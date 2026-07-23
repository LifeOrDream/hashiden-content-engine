import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  BREED_BASE_BODIES,
  assertCountryDpPromptQuality,
  assertCountryEvolutionPromptQuality,
  assertCountryMintPromptQuality,
  assertPetPromptQuality,
  buildCountryEvolutionFullBodyPrompt,
  buildCountryMintDpPrompt,
  buildCountryMintFullBodyPrompt,
  buildPetPromptSet,
  deriveVisualIdentity,
  resolveCountryMintReference,
  resolveCountryMintProfile,
} from "../src/pet-content/index.js";
import {
  genesisPetPacketFixture,
  mintTraitSeedFixture,
  petPacketFixture,
} from "./fixtures/petPacket.js";

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

const genesis = genesisPetPacketFixture();
const countryPrompt = buildCountryMintFullBodyPrompt(genesis);
const countryDpPrompt = buildCountryMintDpPrompt();
assertCountryMintPromptQuality(countryPrompt);
assertCountryDpPromptQuality(countryDpPrompt);
assert.match(countryPrompt, /Faction: India/i);
assert.match(countryPrompt, /Indian Pariah/i);
assert.match(countryPrompt, /same upright standing posture/i);
assert.match(countryPrompt, /7 appearance traits|appearance traits/i);
assert.match(countryDpPrompt, /only identity reference/i);
const mintProfile = resolveCountryMintProfile(genesis);
assert.equal(mintProfile.resolved.faction.name, "India");
assert.equal(mintProfile.resolved.breed.name, "Indian Pariah");

for (let faction = 0; faction < 12; faction += 1) {
  for (let breed = 0; breed < 4; breed += 1) {
    const variant = genesisPetPacketFixture();
    variant.origin.faction_id = faction;
    variant.origin.trait_seed = mintTraitSeedFixture({
      faction,
      stage: 0,
      breed,
      generation: 0,
    });
    variant.pet.body_variant = breed;
    const profile = resolveCountryMintProfile(variant);
    assert.equal(profile.resolved.faction.id, faction);
    assert.equal(profile.decoded.breed, breed);
    assert.ok(profile.resolved.breed.name);
    assert.ok(BREED_BASE_BODIES[faction]?.[breed]);
    assertCountryMintPromptQuality(buildCountryMintFullBodyPrompt(variant));
  }
}

// G0 evolution prompts must carry the effective-DNA personalization slots
// (the §8.9 fix): interview-overridable words reach launch-population art.
function genesisEvolutionFixture(reason: "ascension" | "visual_reroll") {
  const evolution = genesisPetPacketFixture();
  evolution.mode = "pet.evolution_art";
  evolution.evolution_reason = reason;
  evolution.continuity.full_body_url = "https://assets.example.test/pets/chai/full_body.png";
  return evolution;
}

const g0Reroll = genesisEvolutionFixture("visual_reroll");
const g0RerollPrompt = buildCountryEvolutionFullBodyPrompt(g0Reroll);
assertCountryEvolutionPromptQuality(g0RerollPrompt);
assert.equal(g0RerollPrompt, buildCountryEvolutionFullBodyPrompt(g0Reroll), "G0 evolution prompt must be deterministic");
assert.match(g0RerollPrompt, /PERSONALITY IN THE POSE: dramatic, delusional confidence, acts fearless but hates confetti\./);
assert.match(g0RerollPrompt, /CONDUCT: on wins it does one smug spin; on losses it demands a recount\./);
assert.match(g0RerollPrompt, /REMIX TARGET: /);
assert.match(g0RerollPrompt, /never change breed anatomy/i);
assert.match(g0RerollPrompt, /same recognizable HashBeast/i);
// The interview seam: packet dna is effectiveDna, so an override word must land verbatim.
const g0Interviewed = genesisEvolutionFixture("visual_reroll");
g0Interviewed.pet.dna.temperament = "chaotic";
g0Interviewed.pet.dna.victory_ritual = "zoomies lap";
assert.match(
  buildCountryEvolutionFullBodyPrompt(g0Interviewed),
  /PERSONALITY IN THE POSE: chaotic, /,
);
assert.match(buildCountryEvolutionFullBodyPrompt(g0Interviewed), /on wins it zoomies lap;/);
// Remix pick is digest-stable per art_version and gated to visual_reroll only.
const g0RerollNextVersion = genesisEvolutionFixture("visual_reroll");
g0RerollNextVersion.art_version = 2;
assert.notEqual(
  buildCountryEvolutionFullBodyPrompt(g0RerollNextVersion),
  g0RerollPrompt,
  "a new art_version must be able to move the remix digest",
);
const g0Ascension = genesisEvolutionFixture("ascension");
const g0AscensionPrompt = buildCountryEvolutionFullBodyPrompt(g0Ascension);
assertCountryEvolutionPromptQuality(g0AscensionPrompt);
assert.doesNotMatch(g0AscensionPrompt, /REMIX TARGET/);
assert.match(g0AscensionPrompt, /PERSONALITY IN THE POSE: /);
assert.match(g0AscensionPrompt, /EVOLUTION REASON: ascension/);

const packagedBodiesDir = fileURLToPath(new URL("../assets/base_bodies/", import.meta.url));
const bodyFilenames = new Set(Object.values(BREED_BASE_BODIES).flatMap((breeds) => Object.values(breeds)));
assert.equal(bodyFilenames.size, 47, "the 48 breed slots should resolve to 47 bodies because Pungsan is shared");
for (const filename of bodyFilenames) {
  const bytes = await readFile(`${packagedBodiesDir}/${filename}`);
  assert.equal(
    bytes.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    `${filename} must contain PNG bytes`,
  );
}
const packagedReference = await resolveCountryMintReference(genesis);
assert.equal(packagedReference.source, "breed-local:indian_pariah.png");
assert.equal(packagedReference.contentType, "image/png");

const goldenPrompts: Record<string, string> = {
  ...first,
  g0_evolution_visual_reroll: g0RerollPrompt,
  g0_evolution_ascension: g0AscensionPrompt,
};
const hashes = Object.fromEntries(
  Object.entries(goldenPrompts).map(([key, value]) => [
    key,
    createHash("sha256").update(value).digest("hex").slice(0, 16),
  ]),
);
// Golden hashes for pet-prompt-v3-g0-personalized. Re-bake deliberately on
// any prompt change and bump PET_PROMPT_VERSION with it.
assert.deepEqual(hashes, {
  full_body: "5593809c7adcc921",
  dp: "e891985b4d8a6d98",
  expression_sheet: "91813184d7be94a6",
  rare_card: "5c4f9a2af0701bba",
  g0_evolution_visual_reroll: "8944646f0ab256dd",
  g0_evolution_ascension: "f8e74d7830ba1466",
});

console.log("pet prompts OK");
