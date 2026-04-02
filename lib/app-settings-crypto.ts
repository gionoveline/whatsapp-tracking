import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENC_PREFIX = "enc:v1:";
const IV_LENGTH = 12; // AES-GCM recommended nonce size.
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer | null {
  const raw = process.env.APP_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!raw) return null;

  // Accept either base64-encoded 32-byte key or any passphrase (hashed to 32 bytes).
  try {
    const asBase64 = Buffer.from(raw, "base64");
    if (asBase64.length === 32) return asBase64;
  } catch {
    // Ignore and fallback to passphrase hashing.
  }

  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptAppSettingValue(plainText: string): string {
  const key = getEncryptionKey();
  if (!key) return plainText;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, encrypted]).toString("base64");
  return `${ENC_PREFIX}${packed}`;
}

export function decryptAppSettingValue(value: string): string | null {
  if (!value.startsWith(ENC_PREFIX)) return value;

  const key = getEncryptionKey();
  if (!key) return null;

  const payload = value.slice(ENC_PREFIX.length);
  let packed: Buffer;
  try {
    packed = Buffer.from(payload, "base64");
  } catch {
    return null;
  }

  if (packed.length <= IV_LENGTH + TAG_LENGTH) return null;

  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + TAG_LENGTH);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

