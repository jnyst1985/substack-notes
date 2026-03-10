import { createCipheriv, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  const buffer = Buffer.from(key, "hex");
  if (buffer.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars), got ${buffer.length}`
    );
  }
  return buffer;
}

/** Encrypt a string using AES-256-GCM (same format as web/src/lib/crypto.ts) */
export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}
