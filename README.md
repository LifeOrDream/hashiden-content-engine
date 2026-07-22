# Hashiden Pet Content Engine

This repository is the portable image-generation worker for Hashiden's virtual pets. Game truth stays in the backend. The engine accepts a strict `pet-content-v2` visual packet and produces only sparse, high-value media.

## Job Surface

| Kind | Output | When it runs |
| --- | --- | --- |
| `pet.mint_art` | canonical full body + square PFP | first mint |
| `pet.expression_sheet` | six-expression reference sheet | after canonical art |
| `pet.evolution_art` | evolved full body + PFP | ascension, visual reroll, or rebirth |
| `pet.rare_card` | shareable reaction card | jackpot, MVP, or lootbox win |

Normal wins, losses, taps, care choices, and dialogue do not call this service. The backend's deterministic pet reducer owns those reactions.

## Genesis Mint Art

Fresh dog mints restore the country-specific pipeline:

1. Decode the on-chain seed into country, ascension, role, 7 visible appearance traits, and 1 of 48 country-linked dog breeds.
2. Generate a standing 3:4 pixel-art HashBeast from a standing body reference.
3. Validate pose, facing direction, and pixel style with Gemini, retrying up to three times.
4. Generate the square NFT DP from that exact full-body image and validate same-character identity.

Reference precedence is packet URL, configured or packaged local breed body, breed CDN, configured fallback URL, then the packaged standing Doge reference. The package includes 47 unique standing bodies for all 48 country-breed slots; North and South Korea intentionally share the same Pungsan body. Override references with `HASHBEAST_BASE_BODIES_DIR`, `HASHBEAST_BASE_BODIES_BASE_URL`, `HASHBEAST_PUP_REFERENCE_URL`, or `HASHBEAST_PUP_REFERENCE_PATH`. Generation and validation can be tuned with `PET_MINT_IMAGE_MODEL`, `PET_MINT_MAX_RETRIES`, and `PET_MINT_VALIDATE_MODEL`.

## Base Body Assets

Under `assets/base_bodies`, root-level PNGs are generation-0 dog mint references. Generation-1 cats live at `rebirth_01/<country>/<species>.png`, generation-2 primates at `rebirth_02/<country>/<species>.png`, generation-3 Pepe morphs at `rebirth_03/<country>/<species>.png`, generation-4 baby dragons at `rebirth_04/<country>/<species>.png`, generation-5 Mechlings at `rebirth_05/<country>/<species>.png`, and generation-6 HashWaifus at `rebirth_06/<country>/<species>.png`. Each generation provides four variants per country, with country folders and species filenames written in lowercase `snake_case`. `species_roster.json` is the canonical asset roster.

## Local Checks

```bash
npm install
npm test
npm run build
```

The tests use inline artifacts and a fake image provider, so they require no API keys.

## Worker

Configure `.env`, then run:

```bash
npm run service:worker
```

Production should set `PET_ARTIFACT_STORE=s3`; backend result handlers persist public artifact URLs and reject inline-only results.

For localnet, use the same worker and generator with a filesystem-backed artifact store:

```bash
PET_ARTIFACT_STORE=local \
PET_LOCAL_ASSET_DIR=/absolute/path/to/hashiden-game/public/assets/generated/hashbeast-assets \
PET_LOCAL_ASSET_BASE_URL=http://localhost:3100/assets/generated/hashbeast-assets \
npm run service:worker
```

This keeps the production object-key layout and serves distinct canonical `full_body.png` and square `dp.png` files from the local frontend.

## Boundary

The engine has no wallet, chain, database, posting, or game-state authority. It validates the typed visual packet, derives cross-life visual locks from `soul_digest`, builds prompts, generates images, stores artifacts, and returns provenance. The life-specific `identity_digest` remains part of the backend's stale-result guard.

See [docs/PET_CONTENT_CONTRACT.md](docs/PET_CONTENT_CONTRACT.md).
