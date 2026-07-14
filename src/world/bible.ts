/** Mint-only country identity data consumed by the archived faction prompts. */
export interface LegacyFactionBlock {
  id: number;
  name: string;
  code: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    faction_glow: string;
  };
  visual_identity: string;
  faction_lore: Record<string, string>;
  leader: {
    name: string;
    title: string;
    personality: string;
    appearance?: string;
    catchphrases: string[];
  };
}

function faction(
  id: number,
  name: string,
  code: string,
  colors: LegacyFactionBlock["colors"],
  visualIdentity: string,
): LegacyFactionBlock {
  return {
    id,
    name,
    code,
    colors,
    visual_identity: visualIdentity,
    faction_lore: {
      origin: `${name}'s HashBeasts have their own playful chapter in the global Mining Wars.`,
      mining_strategy: `${name} brings a distinct visual culture and mining style to the competition.`,
    },
    leader: {
      name: `${name} Pack Leader`,
      title: `${name} HashBeast Captain`,
      personality: "Competitive, expressive, and fiercely loyal to the pack.",
      catchphrases: [],
    },
  };
}

const FACTIONS: LegacyFactionBlock[] = [
  faction(
    0,
    "USA",
    "usa",
    {
      primary: "#B22234",
      secondary: "#3C3B6E",
      accent: "#FFFFFF",
      faction_glow: "#FFD700",
    },
    "American patriotic aesthetic, red white and blue palette, stars and stripes motifs, bald eagle symbolism, confident swagger, military precision mixed with tech innovation, and Wall Street power vibes",
  ),
  faction(
    1,
    "China",
    "china",
    {
      primary: "#DE2910",
      secondary: "#FFDE00",
      accent: "#000000",
      faction_glow: "#FF4500",
    },
    "Chinese imperial and modern fusion, red and gold palette, dragon and cloud motifs, jade accessories, traditional forms mixed with cyberpunk technology, and ancient wisdom meeting cutting-edge engineering",
  ),
  faction(
    2,
    "Russia",
    "russia",
    {
      primary: "#D52B1E",
      secondary: "#0039A6",
      accent: "#FFFFFF",
      faction_glow: "#8B4513",
    },
    "Russian imperial and Soviet visual fusion, red white and blue palette, double-headed eagle motifs, ushanka and military styling, cold-weather gear, brutalist forms, and imposing winter atmosphere",
  ),
  faction(
    3,
    "India",
    "india",
    {
      primary: "#FF9933",
      secondary: "#138808",
      accent: "#000080",
      faction_glow: "#FFD700",
    },
    "Indian ancient-modern fusion, saffron green navy and gold palette, mandala geometry, spiritual motifs, Bollywood brightness mixed with startup energy, chai and cricket details, and monsoon atmosphere",
  ),
  faction(
    4,
    "Japan",
    "japan",
    {
      primary: "#BC002D",
      secondary: "#FFFFFF",
      accent: "#000000",
      faction_glow: "#FFB7C5",
    },
    "Japanese traditional and hyper-modern fusion, red white and black palette, cherry blossom motifs, samurai and shrine details, clean minimal forms, anime energy, and restrained neon cyberpunk accents",
  ),
  faction(
    5,
    "South Korea",
    "southkorea",
    {
      primary: "#CD2E3A",
      secondary: "#0047A0",
      accent: "#FFFFFF",
      faction_glow: "#FF69B4",
    },
    "Korean traditional-modern fusion, red blue and white palette, hanbok forms with polished K-pop styling, sleek consumer technology, esports energy, neon details, and Gangnam stage confidence",
  ),
  faction(
    6,
    "Iran",
    "iran",
    {
      primary: "#239F40",
      secondary: "#DA0000",
      accent: "#FFFFFF",
      faction_glow: "#FFD700",
    },
    "Persian aesthetic, green red turquoise and gold palette, intricate geometric mosaics, desert and mountain forms, Persepolis-inspired columns, calligraphic rhythm, and Persian miniature detail",
  ),
  faction(
    7,
    "UK",
    "uk",
    {
      primary: "#012169",
      secondary: "#C8102E",
      accent: "#FFFFFF",
      faction_glow: "#FFD700",
    },
    "British regal aesthetic, red white and navy palette, Victorian and royal motifs, London fog atmosphere, tweed and brass materials, stiff-upper-lip elegance, and polished spy sophistication",
  ),
  faction(
    8,
    "North Korea",
    "northkorea",
    {
      primary: "#ED1C27",
      secondary: "#024FA2",
      accent: "#FFFFFF",
      faction_glow: "#FF0000",
    },
    "North Korean retro-futurist propaganda aesthetic, revolutionary red blue and white palette, military precision, monumental Pyongyang forms, mass-game coordination, extreme symmetry, and bold 16-bit poster energy",
  ),
  faction(
    9,
    "France",
    "france",
    {
      primary: "#002395",
      secondary: "#FFFFFF",
      accent: "#ED2939",
      faction_glow: "#FFD700",
    },
    "French elegant aesthetic, blue white and red palette, fleur-de-lis motifs, haute couture silhouettes, cafe and boulevard details, Parisian architecture, and refined revolutionary confidence",
  ),
  faction(
    10,
    "Brazil",
    "brazil",
    {
      primary: "#009C3B",
      secondary: "#FFDF00",
      accent: "#002776",
      faction_glow: "#FFD700",
    },
    "Brazilian vibrant aesthetic, green yellow and blue palette, street-football motion, Amazon mysticism, favela resilience, tropical maximalism, crafted carnival accents, and capoeira flow",
  ),
  faction(
    11,
    "Israel",
    "israel",
    {
      primary: "#0038B8",
      secondary: "#FFFFFF",
      accent: "#0038B8",
      faction_glow: "#FFD700",
    },
    "Israeli ancient-tech fusion, blue white cyan and desert-stone palette, Bauhaus geometry, Jerusalem stone, startup hardware, Negev solar installations, Mediterranean detail, and precise tactical design",
  ),
];

const BY_ID = new Map(FACTIONS.map((entry) => [entry.id, entry]));

export function legacyFactionBlock(factionId: number): LegacyFactionBlock {
  const entry = BY_ID.get(factionId);
  if (!entry) throw new Error(`Mint country catalog has no faction ${factionId}`);
  return entry;
}
