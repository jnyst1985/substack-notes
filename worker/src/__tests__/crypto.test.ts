import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";

// Set env before module-level validation runs
const TEST_KEY = randomBytes(32).toString("hex");

describe("worker crypto roundtrip", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  it("encrypt then decrypt returns original text", async () => {
    const { encrypt } = await import("../crypto-encrypt.js");
    const { decrypt } = await import("../crypto.js");

    const plaintext = "threads-access-token-xyz";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("decrypt rejects malformed input (wrong number of parts)", async () => {
    const { decrypt } = await import("../crypto.js");
    expect(() => decrypt("onlyonepart")).toThrow("Invalid encrypted data format");
  });

  it("decrypt rejects tampered ciphertext", async () => {
    const { encrypt } = await import("../crypto-encrypt.js");
    const { decrypt } = await import("../crypto.js");

    const encrypted = encrypt("secret");
    const parts = encrypted.split(":");
    const flipped =
      parts[2][0] === "0" ? "1" + parts[2].slice(1) : "0" + parts[2].slice(1);
    expect(() => decrypt(`${parts[0]}:${parts[1]}:${flipped}`)).toThrow();
  });

  it("handles unicode text", async () => {
    const { encrypt } = await import("../crypto-encrypt.js");
    const { decrypt } = await import("../crypto.js");

    const text = "emoji 🎉 and 日本語";
    expect(decrypt(encrypt(text))).toBe(text);
  });
});
