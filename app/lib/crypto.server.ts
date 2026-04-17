import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const SALT = Buffer.from("whatssms-shopify-app-v1", "utf8");

function getKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_SECRET || process.env.SHOPIFY_API_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("APP_ENCRYPTION_SECRET (or SHOPIFY_API_SECRET fallback) must be set to encrypt credentials");
  }
  return scryptSync(secret, SALT, 32);
}

/** Encrypt plaintext for storage; returns base64(iv||ciphertext||authTag). */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(IV_LEN, buf.length - 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
