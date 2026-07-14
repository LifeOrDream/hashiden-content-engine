# Contributing

Hashiden's content engine is deliberately small: strict pet packets in, collectible pet images out.

## Setup

```bash
npm install
npm test
```

## Pull Requests

- Keep game state, wallets, databases, and posting out of this repository.
- Keep provider code behind the image-generator or artifact-store ports.
- Include fixture proof for contract or prompt changes.
- Update prompt hashes when a visual-direction change is intentional.
- Never commit secrets, signed URLs, provider logs, or private generated media.

Prompt changes should improve a measurable property such as identity consistency, 64px readability, expression separation, species silhouette, or meme clarity.
