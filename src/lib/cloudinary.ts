import "server-only";
import crypto from "node:crypto";

/*
  Cloudinary image uploads. We upload from the server (a signed upload using the
  API secret) so the secret never reaches the browser, then store only the returned
  https URL in the database (never raw image bytes in Postgres).

  Config comes from env — CLOUDINARY_CLOUD_NAME (public), CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET. Uses plain fetch (no SDK), matching lib/email.ts and lib/sms.ts.
*/
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const KEY = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function cloudinaryConfigured(): boolean {
  return Boolean(CLOUD && KEY && SECRET);
}

export interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Upload an image File to Cloudinary (signed) and return its secure URL.
 * Throws a user-friendly Error on validation failure or a Cloudinary error.
 */
export async function uploadImage(file: File, folder = "chainwork"): Promise<UploadResult> {
  if (!cloudinaryConfigured()) {
    throw new Error(
      "Image uploads aren't configured yet — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
    );
  }
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Please upload a JPG, PNG, WebP, or GIF image.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("That image is too large — the limit is 5 MB.");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  // Cloudinary signs the params you send, alphabetically sorted, then + api_secret (SHA-1).
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(paramsToSign + SECRET).digest("hex");

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", KEY as string);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  let res: Response;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
      method: "POST",
      body: form,
    });
  } catch {
    throw new Error("Couldn't reach the image service — please try again.");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Cloudinary upload failed:", res.status, detail.slice(0, 300));
    throw new Error(`Image upload failed (${res.status}). Please try again.`);
  }

  const json = (await res.json()) as { secure_url?: string; public_id?: string };
  if (!json.secure_url || !json.public_id) {
    throw new Error("Image upload returned an unexpected response.");
  }
  return { url: json.secure_url, publicId: json.public_id };
}
