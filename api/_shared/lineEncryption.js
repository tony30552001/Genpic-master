/**
 * lineEncryption.js
 * AES-256-GCM encryption helpers for securely storing LINE Channel Access Tokens.
 *
 * Environment variable required:
 *   LINE_TOKEN_ENCRYPTION_KEY — 64-character hex string (32 bytes)
 *
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;  // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

const getKey = () => {
    const keyHex = process.env.LINE_TOKEN_ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) {
        throw new Error(
            "Missing or invalid LINE_TOKEN_ENCRYPTION_KEY. " +
            "Expected 64-character hex string (32 bytes). " +
            "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        );
    }
    return Buffer.from(keyHex, "hex");
};

/**
 * Encrypt a plaintext string.
 * Returns a base64url-encoded string: <iv>.<ciphertext>.<authTag>
 */
const encrypt = (plaintext) => {
    if (!plaintext) return null;

    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Join as: base64url(iv) + "." + base64url(ciphertext) + "." + base64url(tag)
    return [
        iv.toString("base64url"),
        encrypted.toString("base64url"),
        tag.toString("base64url"),
    ].join(".");
};

/**
 * Decrypt a string previously encrypted by encrypt().
 * Returns the original plaintext, or throws on tampered data.
 */
const decrypt = (encoded) => {
    if (!encoded) return null;

    const parts = encoded.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted token format");
    }

    const key = getKey();
    const iv = Buffer.from(parts[0], "base64url");
    const ciphertext = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);

    return decrypted.toString("utf8");
};

module.exports = { encrypt, decrypt };
