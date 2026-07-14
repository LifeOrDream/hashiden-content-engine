import type {
  PetContentJobKind,
  PetContentResult,
  PetVisualPacket,
} from "../pet-content/index.js";

export const CONTENT_ENGINE_QUEUE =
  process.env.CONTENT_ENGINE_QUEUE || "hashiden-content-engine";

export type ContentEngineJobKind = PetContentJobKind;

export interface ContentEngineJobPayload<
  K extends ContentEngineJobKind = ContentEngineJobKind,
> {
  kind: K;
  input: PetVisualPacket;
}

export type ContentEngineJobResultMap = {
  [K in ContentEngineJobKind]: PetContentResult;
};
