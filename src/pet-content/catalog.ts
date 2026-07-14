export const PET_PROMPT_VERSION = "pet-prompt-v1";
export const PET_CONTRACT_VERSION = "pet-content-v1";

export const PET_JOB_KINDS = [
  "pet.mint_art",
  "pet.expression_sheet",
  "pet.evolution_art",
  "pet.rare_card",
] as const;

export type PetContentJobKind = (typeof PET_JOB_KINDS)[number];

export const PET_EVOLUTION_REASONS = [
  "ascension",
  "rebirth",
  "visual_reroll",
] as const;

export type PetEvolutionReason = (typeof PET_EVOLUTION_REASONS)[number];

export const RARE_MOMENT_KINDS = [
  "jackpot_won",
  "lootbox_won",
  "mvp_awarded",
] as const;

export const RARE_POSE_IDS = [
  "jackpot",
  "award_speech",
  "box_jackpot",
  "box_point",
  "mvp",
  "medal",
] as const;

export const STAGE_LABELS = [
  "Baby",
  "Rascal",
  "Grinder",
  "Menace",
  "Main Character",
  "Boss",
  "Legend",
  "Unleashed",
] as const;

export const GENERATION_LABELS = [
  "Fresh Mint",
  "Came Back Weird",
  "Market Animal",
  "Mythic Problem",
  "Built Different",
  "Haunted",
  "Cosmic",
  "Final Form",
] as const;

export interface SpeciesDefinition {
  id: string;
  label: string;
  renderNoun: string;
  silhouette: string;
  movement: string;
  memeHook: string;
}

export const SPECIES: Record<string, SpeciesDefinition> = {
  dog: {
    id: "dog",
    label: "Dog",
    renderNoun: "compact pet dog",
    silhouette: "readable muzzle, expressive ears, sturdy paws, clear tail",
    movement: "bouncy paws and tail-led reactions",
    memeHook: "huge confidence and one embarrassing habit",
  },
  cat: {
    id: "cat",
    label: "Cat",
    renderNoun: "compact pet cat",
    silhouette: "sharp ears, round face, long expressive tail",
    movement: "casual slink, sudden pounce, judgmental stillness",
    memeHook: "acts like the wallet is lucky to be here",
  },
  frog: {
    id: "frog",
    label: "Frog",
    renderNoun: "compact pet frog",
    silhouette: "wide head, large eyes, squat spring-loaded legs",
    movement: "tiny hops and abrupt full-body celebrations",
    memeHook: "looks calm while making terrible decisions",
  },
  ape: {
    id: "ape",
    label: "Ape",
    renderNoun: "compact pet ape",
    silhouette: "broad shoulders, long arms, small planted legs",
    movement: "heavy swagger and chest-first celebrations",
    memeHook: "maximum conviction, optional evidence",
  },
  bull: {
    id: "bull",
    label: "Bull",
    renderNoun: "compact pet bull",
    silhouette: "wide horns, thick neck, forward-leaning chest",
    movement: "hoof scrapes, head feints, explosive charges",
    memeHook: "only understands up",
  },
  bear: {
    id: "bear",
    label: "Bear",
    renderNoun: "compact pet bear",
    silhouette: "round ears, heavy paws, broad soft torso",
    movement: "slow confidence, paw slams, dramatic naps",
    memeHook: "calls every dip obvious after it happens",
  },
  crab: {
    id: "crab",
    label: "Crab",
    renderNoun: "compact pet crab",
    silhouette: "wide shell, raised claws, short sideways legs",
    movement: "sideways scuttle, claw clicks, suspicious pivots",
    memeHook: "refuses to move in the expected direction",
  },
  whale: {
    id: "whale",
    label: "Whale",
    renderNoun: "compact pet whale",
    silhouette: "huge rounded head, tiny fins, tapered tail",
    movement: "weightless bob and enormous splash energy",
    memeHook: "acts casual around amounts that scare everyone else",
  },
  dragon: {
    id: "dragon",
    label: "Dragon",
    renderNoun: "compact pet dragon",
    silhouette: "small horns, wing nubs, thick tail, readable snout",
    movement: "proud stomps, wing flicks, accidental smoke puffs",
    memeHook: "ancient power, toddler patience",
  },
  phoenix: {
    id: "phoenix",
    label: "Phoenix",
    renderNoun: "compact pet phoenix",
    silhouette: "crest feathers, small wings, bright fan tail",
    movement: "quick wing flourishes and theatrical landings",
    memeHook: "treats every recovery like a comeback tour",
  },
  mech: {
    id: "mech",
    label: "Mech",
    renderNoun: "compact pet-like mech",
    silhouette: "blocky head, sturdy limbs, one bright status light",
    movement: "servo snaps, tiny boot sequence, power poses",
    memeHook: "advanced hardware running personal grudges",
  },
  golem: {
    id: "golem",
    label: "Golem",
    renderNoun: "compact pet-like stone golem",
    silhouette: "chunky stone hands, squat body, glowing seams",
    movement: "heavy steps, pebble shakes, surprisingly gentle pats",
    memeHook: "built like a vault, emotionally a houseplant",
  },
  ghost: {
    id: "ghost",
    label: "Ghost",
    renderNoun: "compact mischievous ghost pet",
    silhouette: "large face, floating hands, tapered spectral tail",
    movement: "hovering drifts, sudden flickers, moving objects",
    memeHook: "still haunted by one leaderboard result",
  },
  mimic: {
    id: "mimic",
    label: "Mimic",
    renderNoun: "compact treasure-chest mimic pet",
    silhouette: "boxy body, lid-like brow, small feet, enormous grin",
    movement: "hinge snaps, coin rattles, fake-object disguises",
    memeHook: "pretends to be loot until attention arrives",
  },
  cosmic_blob: {
    id: "cosmic_blob",
    label: "Cosmic Blob",
    renderNoun: "compact cosmic blob pet",
    silhouette: "simple rounded body, two bright eyes, one orbiting speck",
    movement: "soft wobble, tiny gravity pulses, impossible squishes",
    memeHook: "contains galaxies and no risk management",
  },
  eidolon: {
    id: "eidolon",
    label: "Eidolon",
    renderNoun: "compact final-form eidolon pet",
    silhouette: "iconic mask-face, floating paws, halo-like memory ring",
    movement: "effortless hover and perfectly timed tiny gestures",
    memeHook: "has seen every market cycle and remains petty",
  },
};

export const SPECIES_BY_GENERATION = [
  ["dog", "dog", "dog", "dog"],
  ["cat", "cat", "frog", "ape"],
  ["bull", "bear", "crab", "whale"],
  ["dragon", "dragon", "phoenix", "phoenix"],
  ["mech", "mech", "golem", "golem"],
  ["ghost", "ghost", "mimic", "mimic"],
  ["cosmic_blob", "cosmic_blob", "cosmic_blob", "cosmic_blob"],
  ["eidolon", "eidolon", "eidolon", "eidolon"],
] as const;

export function speciesIdFor(generation: number, bodyVariant: number): string {
  return SPECIES_BY_GENERATION[generation]?.[bodyVariant] || "dog";
}

export const DNA_VALUES = {
  temperament: ["chaotic", "proud", "clingy", "deadpan", "curious", "dramatic", "stubborn", "suspicious"],
  attachment_style: ["tiny shadow", "loud showoff", "selective softie", "independent roommate"],
  humor_mode: ["deadpan", "overreaction", "petty commentary", "physical comedy", "delusional confidence"],
  bad_habit: ["steals lucky objects", "fake-sleeps after losses", "argues with the scoreboard", "hoards shiny receipts", "claims every win was predicted", "sits on important buttons"],
  comfort_item: ["bent coin", "tiny pickaxe", "red bandana", "broken calculator", "lucky sock", "miniature flag"],
  victory_ritual: ["does one smug spin", "headbutts the air", "moonwalks badly", "rings an imaginary bell", "freezes in a power pose"],
  loss_response: ["refuses to look at the result", "blames the moon", "takes a tactical nap", "stares at the winning lane", "demands a recount"],
  jealousy_trigger: ["another pet getting praised", "a larger multiplier", "a cleaner profile picture", "someone touching the lucky item", "a rival winning quietly"],
  mischief: ["moves the favorite-lane marker", "hides one tiny coin", "renames the strategy in its head", "pretends the next result is obvious", "copies a rival's pose"],
  signature_sound: ["tiny bonk", "offended chirp", "coin clink", "dramatic gasp", "small victory horn", "suspicious hum"],
  visual_gag: ["wears one sock incorrectly", "carries an absurdly small chart", "has a lucky spoon", "keeps one emergency snack", "guards a useless shiny pebble", "wears a medal it made itself"],
  contradiction: ["acts fearless but hates confetti", "claims independence but follows the owner everywhere", "looks serious but celebrates with tiny hops", "loves risk but is protective of one bent coin", "judges every strategy and has none", "demands attention then pretends not to notice it"],
} as const;
