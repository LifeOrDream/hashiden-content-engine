import type { PetContentJobKind, PetVisualPacket } from "../../src/pet-content/index.js";

function setBits(
  bytes: Uint8Array,
  offset: number,
  width: number,
  value: number,
): void {
  for (let index = 0; index < width; index += 1) {
    const bit = offset + index;
    const mask = 1 << (bit % 8);
    if ((value >> index) & 1) bytes[Math.floor(bit / 8)] |= mask;
    else bytes[Math.floor(bit / 8)] &= ~mask;
  }
}

export function mintTraitSeedFixture(args: {
  faction: number;
  stage: number;
  breed: number;
  generation: number;
}): string {
  const bytes = new Uint8Array(32);
  setBits(bytes, 0, 4, args.faction);
  setBits(bytes, 4, 3, args.stage);
  [3, 7, 11, 15, 19, 23, 27].forEach((value, group) => {
    setBits(bytes, 7 + group * 15, 5, value);
  });
  [2, 4, 6, 8, 10].forEach((value, group) => {
    setBits(bytes, 112 + group * 12, 4, value);
  });
  bytes[22] = 4;
  bytes[23] = 9;
  setBits(bytes, 172, 2, args.breed);
  setBits(bytes, 174, 3, args.generation);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function petPacketFixture(kind: PetContentJobKind = "pet.mint_art"): PetVisualPacket {
  const traitSeed = mintTraitSeedFixture({
    faction: 3,
    stage: 4,
    breed: 2,
    generation: 2,
  });
  return {
    contract_version: "pet-content-v2",
    mode: kind,
    mint: "11111111111111111111111111111111",
    soul_digest: "5c".repeat(32),
    life_id: "11111111111111111111111111111111:g2:fixture",
    identity_digest: "a1".repeat(32),
    art_version: 3,
    evolution_reason: kind === "pet.evolution_art" ? "rebirth" : null,
    origin: {
      trait_seed: traitSeed,
      faction_id: 3,
      reference_image_url: null,
    },
    pet: {
      name: "Bonk Jr",
      body_variant: 2,
      generation: 2,
      species_id: "crab",
      stage: 4,
      dna: {
        version: 1,
        temperament: "dramatic",
        attachment_style: "selective softie",
        bad_habit: "argues with the scoreboard",
        comfort_item: "bent coin",
        victory_ritual: "does one smug spin",
        loss_response: "demands a recount",
        jealousy_trigger: "another pet getting praised",
        mischief: "moves the favorite-lane marker",
        signature_sound: "tiny bonk",
        humor_mode: "delusional confidence",
        visual_gag: "carries an absurdly small chart",
        contradiction: "acts fearless but hates confetti",
      },
      past_life_echo: "the lucky spoon from its frog life",
    },
    continuity: {
      dp_url: "https://assets.example.test/pets/bonk/dp.png",
      full_body_url: "https://assets.example.test/pets/bonk/full_body.png",
      expression_sheet_url: null,
    },
    rare_moment: kind === "pet.rare_card"
      ? {
          event_id: "jackpot:fixture:1",
          kind: "jackpot_won",
          caption: "Bonk Jr has confused luck with talent",
          pose_id: "jackpot",
        }
      : null,
  };
}

export function genesisPetPacketFixture(): PetVisualPacket {
  const packet = petPacketFixture("pet.mint_art");
  packet.life_id = "11111111111111111111111111111111:g0:fixture";
  packet.art_version = 1;
  packet.origin.trait_seed = mintTraitSeedFixture({
    faction: 3,
    stage: 0,
    breed: 2,
    generation: 0,
  });
  packet.pet.name = "Chai";
  packet.pet.generation = 0;
  packet.pet.species_id = "dog";
  packet.pet.stage = 0;
  packet.pet.past_life_echo = null;
  packet.continuity = {
    dp_url: null,
    full_body_url: null,
    expression_sheet_url: null,
  };
  return packet;
}
