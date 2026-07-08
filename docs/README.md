# HASHIDEN AI Content Engine Docs

Start here if you are trying to understand or contribute to the open-source engine behind HASHIDEN, the show written by Hashiden gameplay.

## Read In This Order

1. [Show Bible](../SHOW_BIBLE.md) — what the show is for: the Kardashev premise, the tonal contract, the season spine.
2. [World Bible](../WORLD_BIBLE.md) — the canon roster: Council of Twelve, rivalry map, style ladder, progression grammar, editing rules.
3. [Architecture](architecture.md) — the engine/backend boundary and the service-mode job surface.
4. [Story Engine](story-engine.md) — beast memory, epithets, technique debuts, mint intros, and Hashiden chapter generation.
5. [NFT Asset Pipeline](nft-pipeline.md) — mint art, state-loop APNGs, mutation content, cycle recaps.
6. [Base Types](base-types.md) — the body-plan layer above breed (canine, primate, amphibian, feline).
7. [Casino Rituals + Audio Identity](rituals-and-audio.md) — lootbox reveals, claim rolls, rarity light language, sound spec.
8. [Multi-Scene Video](video-scenes.md) — the Seedance 2.0 multi-scene primitive: in-prompt cuts, frame control, native audio, chaining.
9. [Media Proof and Evals](evals-and-media-proof.md)
10. [World Packs](world-packs.md)
11. [Provider Adapters](provider-adapters.md)
12. [Trailer Pipeline](../trailer/README.md)
13. [Contributing](../CONTRIBUTING.md)

## Reference

- [Labels](labels.md) — the issue-label operating system for contributors.
- [Content Growth Plan](CONTENT-GROWTH-PLAN.md) — producer-level audit of the generation system and the multi-format roadmap.

## Contributor Promise

You should be able to improve the engine without access to Hashiden production secrets.

The no-key path is:

```bash
npm install
npm run demo:fixture
```

Live media generation requires provider keys and should always include proof artifacts in the PR.
