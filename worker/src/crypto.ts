import { createDecipheriv } from "node:crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  throw new Error("ENCRYPTION_KEY environment variable is not set");
}
const KEY_BUFFER = (() => {
  const buffer = Buffer.from(ENCRYPTION_KEY, "hex");
  if (buffer.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars), got ${buffer.length}`
    );
  }
  return buffer;
})();

export function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv("aes-256-gcm", KEY_BUFFER, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}
