import { GoogleGenAI, createUserContent } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_KEY || "";
const GEMINI_MODEL =
  process.env.PET_MINT_VALIDATE_MODEL ||
  process.env.NFT_VALIDATE_MODEL ||
  "gemini-2.5-flash";

export type PetImageComparison = "full_body" | "dp";

export interface PetImageValidationResult {
  isValid: boolean;
  reason: string;
}

export type PetImageValidator = (
  reference: Buffer,
  candidate: Buffer,
  comparison: PetImageComparison,
) => Promise<PetImageValidationResult>;

let client: GoogleGenAI | null = null;

function gemini(): GoogleGenAI | null {
  if (!GEMINI_API_KEY) return null;
  client ||= new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return client;
}

function imageMime(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/png";
}

export function validationPrompt(comparison: PetImageComparison): string {
  if (comparison === "full_body") {
    return `Compare two HashBeast images.

IMAGE 1 is the standing body reference. IMAGE 2 is the generated country-and-breed character.

Answer YES only when IMAGE 2 has all of these:
1. the same upright standing posture and body angle as IMAGE 1
2. the same retro pixel-art medium and approximately the same pixel density
3. the same facing direction and full-body framing
4. one coherent anthropomorphic dog with normal anatomy and no extra limbs

The breed, country, colors, clothing, and equipment are intentionally different and must not be compared.

Respond with exactly YES or NO.`;
  }
  return `Compare two images of one HashBeast.

IMAGE 1 is the canonical full-body character. IMAGE 2 should be its square display picture.

Answer YES only when IMAGE 2:
1. is unmistakably the exact same individual character and dog breed
2. preserves face geometry, fur colors, markings, outfit, and accessories
3. preserves the same retro pixel-art medium and pixel density
4. is an upper-body portrait with the face angled slightly right

Respond with exactly YES or NO.`;
}

export const validatePetImageIdentity: PetImageValidator = async (
  reference,
  candidate,
  comparison,
) => {
  const ai = gemini();
  if (!ai) {
    return { isValid: true, reason: "validation skipped: GEMINI_KEY is not configured" };
  }
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: createUserContent([
        validationPrompt(comparison),
        { inlineData: { mimeType: imageMime(reference), data: reference.toString("base64") } },
        { inlineData: { mimeType: imageMime(candidate), data: candidate.toString("base64") } },
      ]),
    });
    const verdict = String(response.text || "").trim().toUpperCase();
    if (verdict === "YES") return { isValid: true, reason: `passed ${GEMINI_MODEL}` };
    if (verdict === "NO") return { isValid: false, reason: `failed ${GEMINI_MODEL}` };
    return { isValid: true, reason: `inconclusive ${GEMINI_MODEL} response accepted` };
  } catch (error: any) {
    console.warn(`[pet-content] identity validation failed open: ${error?.message || error}`);
    return { isValid: true, reason: "validator error accepted" };
  }
};
