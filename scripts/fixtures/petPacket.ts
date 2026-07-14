import type { PetContentJobKind, PetVisualPacket } from "../../src/pet-content/index.js";

export function petPacketFixture(kind: PetContentJobKind = "pet.mint_art"): PetVisualPacket {
  return {
    contract_version: "pet-content-v1",
    mode: kind,
    mint: "11111111111111111111111111111111",
    soul_digest: "5c".repeat(32),
    life_id: "11111111111111111111111111111111:g2:fixture",
    identity_digest: "a1".repeat(32),
    art_version: 3,
    evolution_reason: kind === "pet.evolution_art" ? "rebirth" : null,
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
