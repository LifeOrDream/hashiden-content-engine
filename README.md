# Hashiden Pet Content Engine

This repository is the portable image-generation worker for Hashiden's virtual pets. Game truth stays in the backend. The engine accepts a strict `pet-content-v1` visual packet and produces only sparse, high-value media.

## Job Surface

| Kind | Output | When it runs |
| --- | --- | --- |
| `pet.mint_art` | canonical full body + square PFP | first mint |
| `pet.expression_sheet` | six-expression reference sheet | after canonical art |
| `pet.evolution_art` | evolved full body + PFP | ascension, visual reroll, or rebirth |
| `pet.rare_card` | shareable reaction card | jackpot, MVP, or lootbox win |

Normal wins, losses, taps, care choices, and dialogue do not call this service. The backend's deterministic pet reducer owns those reactions.

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

## Boundary

The engine has no wallet, chain, database, posting, or game-state authority. It validates the typed visual packet, derives cross-life visual locks from `soul_digest`, builds prompts, generates images, stores artifacts, and returns provenance. The life-specific `identity_digest` remains part of the backend's stale-result guard.

See [docs/PET_CONTENT_CONTRACT.md](docs/PET_CONTENT_CONTRACT.md).
