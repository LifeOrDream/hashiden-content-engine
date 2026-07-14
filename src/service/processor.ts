import {
  generatePetContent,
  parsePetVisualPacket,
  type PetGenerationProgress,
} from "../pet-content/index.js";
import type {
  ContentEngineJobKind,
  ContentEngineJobPayload,
  ContentEngineJobResultMap,
} from "./contracts.js";

export interface ProcessJobOptions {
  onProgress?: (update: PetGenerationProgress) => void | Promise<void>;
}

export async function processContentEngineJob<K extends ContentEngineJobKind>(
  payload: ContentEngineJobPayload<K>,
  options: ProcessJobOptions = {},
): Promise<ContentEngineJobResultMap[K]> {
  if (!payload || typeof payload !== "object") throw new Error("job payload is required");
  const payloadKeys = Object.keys(payload as unknown as Record<string, unknown>);
  if (
    payloadKeys.length !== 2 ||
    !payloadKeys.includes("kind") ||
    !payloadKeys.includes("input")
  ) {
    throw new Error("job payload must contain exactly kind and input");
  }
  const packet = parsePetVisualPacket(payload.input, payload.kind);
  return generatePetContent(packet, {
    onProgress: options.onProgress,
  }) as Promise<ContentEngineJobResultMap[K]>;
}
