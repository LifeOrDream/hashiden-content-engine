# Pet Content Contract

## Product Rules

- Pets are raised, not cast in films.
- The everyday loop is deterministic and instant. AI is reserved for collectible media milestones.
- Every pet must read at 64 pixels and carry one stable visual gag.
- Art direction targets roughly 70% cool collectible and 30% absurd meme energy.
- Rebirth changes species decisively while preserving color family, eyes, marking, and one past-life cue.
- Fresh dog mints use the country, breed, role, ascension, and 7 visible appearance traits encoded in the on-chain seed.
- Inputs are structured and versioned. There is no free-form owner prompt; pet
  names and deterministic rare captions are conservatively sanitized.

## Request

Every BullMQ job uses:

```json
{
  "kind": "pet.mint_art",
  "input": {
    "contract_version": "pet-content-v2",
    "mode": "pet.mint_art",
    "mint": "...",
    "soul_digest": "stable sha256 hex",
    "life_id": "...",
    "identity_digest": "sha256 hex",
    "art_version": 1,
    "evolution_reason": null,
    "origin": {
      "trait_seed": "32-byte hex",
      "faction_id": 3,
      "reference_image_url": null
    },
    "pet": {},
    "continuity": {},
    "rare_moment": null
  }
}
```

The packet contains only the fields used to build visual identity, continuity, or
the rare moment. The parser rejects unknown fields, allowlists job kinds,
species, rare poses, and every DNA value, and verifies that generation, body
variant, and species agree. It also re-decodes `origin.trait_seed` and verifies
that country, breed, ascension stage, and generation match the backend packet.
Labels and species language are derived locally.

`pet.evolution_art` requires exactly one `evolution_reason`: `rebirth`,
`ascension`, or `visual_reroll`. Other job kinds require `null`.

## Result

Results echo the identity tuple and include `prompt_version`, exact prompts, and artifact provenance. The backend accepts a result only when `life_id`, `identity_digest`, and `art_version` still match current pet state.

## Identity

`soul_digest` deterministically selects palette, face marking, and eyes. The DNA
signature gag is also soul-stable; the smaller life token may change on rebirth.
`identity_digest` remains life-specific and is used for stale-result rejection.
Body proportions follow the current body variant and species. Generation-zero
dog mints resolve one of 12 country grammars and 48 country-linked breeds. Their
full body uses a standing reference for posture, facing, and pixel style; the
square PFP then uses that generated full body as its sole identity reference.
Both images pass bounded Gemini checks when `GEMINI_KEY` is configured. Later
species keep the pet-runtime prompt path and canonical continuity references.
Expression sheets and rare cards require existing canonical art.

## Change Policy

Contract changes require a new contract version. Prompt changes require fixture tests and updated prompt hashes. Media-provider changes stay behind the `ImageGenerator` port.
