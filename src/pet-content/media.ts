const FAL_QUEUE_URL = process.env.FAL_QUEUE_URL || "https://queue.fal.run";
const PET_IMAGE_GENERATION_MODEL =
  process.env.PET_IMAGE_GENERATION_MODEL || "fal-ai/nano-banana-2";
const PET_IMAGE_EDIT_MODEL =
  process.env.PET_IMAGE_EDIT_MODEL || "fal-ai/nano-banana-2/edit";
const POLL_MS = Math.max(1_000, Number(process.env.FAL_POLL_INTERVAL_MS || 3_000));
const TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.PET_IMAGE_TIMEOUT_MS || 180_000),
);

export interface ImageReference {
  url?: string;
  buffer?: Buffer;
  contentType?: string;
}

export interface GeneratedImage {
  buffer: Buffer;
  sourceUrl?: string;
  model: string;
  requestId?: string;
}

export interface GenerateImageOptions {
  aspectRatio: "1:1" | "3:4" | "4:5";
  resolution?: "1K" | "2K";
}

export type ImageGenerator = (
  prompt: string,
  references: ImageReference[],
  options: GenerateImageOptions,
) => Promise<GeneratedImage>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return {
          buffer: Buffer.from(await response.arrayBuffer()),
          contentType: response.headers.get("content-type") || "image/png",
        };
      }
      lastError = new Error(`image fetch returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 4) await sleep(attempt * 750);
  }
  throw lastError instanceof Error ? lastError : new Error("image fetch failed");
}

async function referenceDataUri(reference: ImageReference): Promise<string> {
  if (reference.buffer) {
    return `data:${reference.contentType || "image/png"};base64,${reference.buffer.toString("base64")}`;
  }
  if (reference.url) {
    const fetched = await fetchBuffer(reference.url);
    return `data:${fetched.contentType};base64,${fetched.buffer.toString("base64")}`;
  }
  throw new Error("image reference requires url or buffer");
}

function requestIdOf(value: any): string | undefined {
  const direct = value?.request_id || value?.requestId || value?.id;
  if (direct) return String(direct);
  const match = String(value?.status_url || "").match(/\/requests\/([^/?#]+)/i);
  return match?.[1];
}

async function runFalImage(
  model: string,
  prompt: string,
  imageUrls: string[],
  options: GenerateImageOptions,
): Promise<GeneratedImage> {
  const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY || "";
  if (!apiKey) throw new Error("FAL_KEY is required for pet image generation");
  const headers = {
    Authorization: `Key ${apiKey}`,
    "Content-Type": "application/json",
  };
  const submitResponse = await fetch(`${FAL_QUEUE_URL}/${model}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt,
      ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
      num_images: 1,
      aspect_ratio: options.aspectRatio,
      resolution: options.resolution || "1K",
      output_format: "png",
      safety_tolerance: "6",
    }),
  });
  if (!submitResponse.ok) {
    throw new Error(
      `fal submit ${submitResponse.status}: ${(await submitResponse.text()).slice(0, 300)}`,
    );
  }

  const submitted: any = await submitResponse.json();
  const requestId = requestIdOf(submitted);
  let data = submitted;
  if (!submitted?.images?.[0]?.url) {
    if (!submitted.status_url || !submitted.response_url) {
      throw new Error("fal image response did not include queue URLs");
    }
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const statusResponse = await fetch(submitted.status_url, { headers });
      if (!statusResponse.ok) continue;
      const status: any = await statusResponse.json();
      if (status.status === "FAILED" || status.status === "ERROR") {
        throw new Error(`fal image job failed: ${JSON.stringify(status).slice(0, 300)}`);
      }
      if (status.status !== "COMPLETED") continue;
      const resultResponse = await fetch(submitted.response_url, { headers });
      if (!resultResponse.ok) continue;
      data = await resultResponse.json();
      break;
    }
  }

  const sourceUrl = data?.images?.[0]?.url;
  if (!sourceUrl) throw new Error(`fal image job timed out or returned no image (${requestId || "unknown"})`);
  const fetched = await fetchBuffer(sourceUrl);
  return {
    buffer: fetched.buffer,
    sourceUrl,
    model,
    requestId,
  };
}

export const generatePetImage: ImageGenerator = async (
  prompt,
  references,
  options,
) => {
  const imageUrls = await Promise.all(references.map(referenceDataUri));
  const model = imageUrls.length > 0
    ? PET_IMAGE_EDIT_MODEL
    : PET_IMAGE_GENERATION_MODEL;
  return runFalImage(model, prompt, imageUrls, options);
};
