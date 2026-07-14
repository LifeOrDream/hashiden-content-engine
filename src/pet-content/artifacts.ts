import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { GeneratedImage } from "./media.js";
import type { PetArtifact } from "./contracts.js";

export interface ArtifactStore {
  readonly mode: "s3" | "inline";
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
  private readonly client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
  private readonly bucket: string;
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor() {
    this.bucket = process.env.BUCKET_NAME || process.env.HASHBEAST_ASSETS_BUCKET || "";
    if (!this.bucket) throw new Error("BUCKET_NAME is required for S3 pet artifacts");
    this.root = (process.env.PET_ASSET_ROOT || "hashbeast-assets").replace(/^\/+|\/+$/g, "");
    this.publicBaseUrl = (
      process.env.HASHBEAST_ASSETS_BASE_URL ||
      `https://${this.bucket}.s3.amazonaws.com/${this.root}`
    ).replace(/\/$/, "");
  }

  async put(relativeKey: string, buffer: Buffer, contentType: string): Promise<{ url: string }> {
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

let defaultStore: ArtifactStore | null = null;

export function getDefaultArtifactStore(): ArtifactStore {
  if (defaultStore) return defaultStore;
  const mode = (process.env.PET_ARTIFACT_STORE || "").toLowerCase();
  const bucket = process.env.BUCKET_NAME || process.env.HASHBEAST_ASSETS_BUCKET || "";
  defaultStore = mode === "inline" || (!mode && !bucket)
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
