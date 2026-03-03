import { createCipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;
const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, "hex");

/** Encrypt a string using AES-256-GCM (same format as web/src/lib/crypto.ts) */
export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", KEY_BUFFER, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}
