/**
 * Shared input shapes for the NFT pipeline jobs.
 *
 * The engine never reads game state: every job receives a self-contained
 * snapshot of the beast (canonical asset URLs, DNA, personality) built by the
 * caller. Loading/persisting that snapshot is the backend's job.
 */

export interface NftBeastPersonality {
  archetype?: string;
  tone?: string;
  motivation?: string;
  catchphrase?: string;
}

/** Self-contained beast snapshot passed into animation/mutation jobs. */
export interface NftBeastInput {
  mint: string;
  name?: string;
  /** 256-bit DNA hex; used to resolve faction/breed/type/evolution for prompts. */
  dna?: string;
  /** Faction id 0-11 — fallback when DNA is absent or undecodable. */
  factionId?: number;
  /** Canonical art the generation grounds on (identity source of truth). */
  assetUrls?: { fullBody?: string; dp?: string };
  /** Storage-relative folder all artifacts are keyed under, e.g. "usa/army/region_3/<mint>". */
  storagePath?: string;
  personality?: NftBeastPersonality;
  bio?: string;
  /**
   * Optional pre-built owner/profile context block (the backend owns user
   * data; when it wants owner flavor in the motion it passes the prompt block
   * ready-made).
   */
  ownerProfileBlock?: string;
  /**
   * The beast's distilled prompt genome, pre-rendered by the backend into two
   * variants (src/nft-pipeline/genomeBlock.ts):
   *   - forText  — full lineage (motif/motivation/echoes); TEXT surfaces only.
   *   - forImage — aesthetic tokens + arc stage ONLY; IMAGE surfaces only, and
   *                the engine defensively re-strips it so no technique/epithet
   *                name or motif prose can ever reach a picture.
   */
  genomeBlock?: import("./genomeBlock.js").GenomeBlock;
  multiplier?: number;
  evolutionStage?: number;
  breedValue?: number;
  breedName?: string;
  /**
   * Body-plan layer above breed ("forms are fluid"): "canine" (genesis
   * default) | "primate" | "amphibian" | "feline". Non-canine forms are
   * granted only through the lootbox/rebirth path — the backend owns that
   * gate and simply passes the beast's earned baseType in the snapshot.
   * Invalid values fall back to canine (best-effort, never fails a job).
   */
  baseType?: string;
}
