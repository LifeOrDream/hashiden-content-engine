import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedImage } from "./media.js";
import type { PetArtifact } from "./contracts.js";

export interface ArtifactStore {
  readonly mode: "s3" | "inline" | "local";
  put(
    relativeKey: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ url?: string; base64?: string }>;
}

export class InlineArtifactStore implements ArtifactStore {
  readonly mode = "inline" as const;

  async put(_relativeKey: string, buffer: Buffer): Promise<{ base64: string }> {
    return { base64: buffer.toString("base64") };
  }
}

export class S3ArtifactStore implements ArtifactStore {
  readonly mode = "s3" as const;
  private readonly client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
  });
  private readonly bucket: string;
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor() {
    this.bucket =
      process.env.BUCKET_NAME || process.env.HASHBEAST_ASSETS_BUCKET || "";
    if (!this.bucket)
      throw new Error("BUCKET_NAME is required for S3 pet artifacts");
    this.root = (process.env.PET_ASSET_ROOT || "hashbeast-assets").replace(
      /^\/+|\/+$/g,
      "",
    );
    this.publicBaseUrl = (
      process.env.HASHBEAST_ASSETS_BASE_URL ||
      `https://${this.bucket}.s3.amazonaws.com/${this.root}`
    ).replace(/\/$/, "");
  }

  async put(
    relativeKey: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ url: string }> {
    const cleanKey = relativeKey.replace(/^\/+/, "");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `${this.root}/${cleanKey}`,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { url: `${this.publicBaseUrl}/${cleanKey}` };
  }
}

export interface LocalArtifactStoreOptions {
  rootDir?: string;
  publicBaseUrl?: string;
}

function localArtifactPath(relativeKey: string): string[] {
  const cleanKey = relativeKey.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const parts = cleanKey.split("/");
  if (
    !cleanKey ||
    parts.some(
      (part) => !part || part === "." || part === ".." || part.includes("\0"),
    )
  ) {
    throw new Error(`invalid local pet artifact key: ${relativeKey}`);
  }
  return parts;
}

/**
 * Localnet equivalent of S3ArtifactStore. It preserves the production object
 * key layout while exposing files through the frontend's public directory.
 */
export class LocalArtifactStore implements ArtifactStore {
  readonly mode = "local" as const;
  private readonly rootDir: string;
  private readonly publicBaseUrl: string;

  constructor(options: LocalArtifactStoreOptions = {}) {
    const rootDir = options.rootDir || process.env.PET_LOCAL_ASSET_DIR || "";
    if (!rootDir)
      throw new Error(
        "PET_LOCAL_ASSET_DIR is required for local pet artifacts",
      );
    this.rootDir = path.resolve(rootDir);
    this.publicBaseUrl = (
      options.publicBaseUrl ||
      process.env.PET_LOCAL_ASSET_BASE_URL ||
      ""
    ).replace(/\/$/, "");
    if (!this.publicBaseUrl) {
      throw new Error(
        "PET_LOCAL_ASSET_BASE_URL is required for local pet artifacts",
      );
    }
  }

  async put(
    relativeKey: string,
    buffer: Buffer,
    _contentType: string,
  ): Promise<{ url: string }> {
    const parts = localArtifactPath(relativeKey);
    const destination = path.join(this.rootDir, ...parts);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await writeFile(temporary, buffer);
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    const publicKey = parts.map(encodeURIComponent).join("/");
    return { url: `${this.publicBaseUrl}/${publicKey}` };
  }
}

let defaultStore: ArtifactStore | null = null;

export function getDefaultArtifactStore(): ArtifactStore {
  if (defaultStore) return defaultStore;
  const mode = (process.env.PET_ARTIFACT_STORE || "").toLowerCase();
  const bucket =
    process.env.BUCKET_NAME || process.env.HASHBEAST_ASSETS_BUCKET || "";
  defaultStore =
    mode === "local"
      ? new LocalArtifactStore()
      : mode === "inline" || (!mode && !bucket)
        ? new InlineArtifactStore()
        : new S3ArtifactStore();
  return defaultStore;
}

export function setDefaultArtifactStore(store: ArtifactStore | null): void {
  defaultStore = store;
}

export async function storePetArtifact(args: {
  store: ArtifactStore;
  kind: PetArtifact["kind"];
  key: string;
  image: GeneratedImage;
}): Promise<PetArtifact> {
  const placed = await args.store.put(args.key, args.image.buffer, "image/png");
  return {
    kind: args.kind,
    key: args.key,
    content_type: "image/png",
    url: placed.url,
    base64: placed.base64,
    model: args.image.model,
    request_id: args.image.requestId,
  };
}
