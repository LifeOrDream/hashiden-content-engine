# AGENTS.md

## Boundaries

- Keep the engine portable and backend-free.
- Never add game-state, wallet, database, admin, or posting authority here.
- Never read or print `.env` values.
- Keep provider calls behind `ImageGenerator` and persistence behind `ArtifactStore`.

## Workflow

1. Read `README.md` and `docs/PET_CONTENT_CONTRACT.md`.
2. Keep `src/service/contracts.ts` and `src/service/processor.ts` in sync.
3. Run `npm test` and `npm run build`.
4. For intentional prompt changes, update and review the prompt hashes.

## Prompt Rules

- Optimize for pet attachment, meme clarity, identity continuity, and 64px readability.
- Preserve canonical identity whenever a reference image is present.
- Accept only structured, allowlisted traits. Do not pass owner prose through to providers.
- Do not reintroduce film, trailer, screenplay, lore, voice, or chat generation.
