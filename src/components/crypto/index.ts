import {
    createCipheriv,
    createDecipheriv,
    createHash,
    generateKeyPairSync,
    randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
// AES-GCM standard nonce length.
const IV_LENGTH = 12;
// Prefix so the stored format can evolve (e.g. a future key rotation scheme) without ambiguity.
const VERSION = 'v1';
const PART_SEPARATOR = ':';

// Normalizes an arbitrary-length configured key into a 32-byte AES-256 key. The stack crypto key
// (CONTROL_API_CRYPTO_KEY) is already high-entropy secret material, so a fast hash only fits it to
// the cipher's key size — this is not a substitute for a slow KDF over a low-entropy password.
function deriveKey(cryptoKey: string): Buffer {
    return createHash('sha256').update(cryptoKey, 'utf8').digest();
}

// Encrypts a UTF-8 string with AES-256-GCM and returns a self-describing, versioned token:
//   v1:<ivBase64>:<authTagBase64>:<ciphertextBase64>
// The random IV makes each ciphertext unique; the GCM auth tag makes tampering detectable on decrypt.
export function encryptString(plaintext: string, cryptoKey: string): string {
    const key = deriveKey(cryptoKey);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
        VERSION,
        iv.toString('base64'),
        authTag.toString('base64'),
        ciphertext.toString('base64'),
    ].join(PART_SEPARATOR);
}

// Inverse of encryptString. Throws if the payload is malformed or if the auth tag does not verify
// (wrong key or tampered ciphertext).
export function decryptString(payload: string, cryptoKey: string): string {
    const parts = payload.split(PART_SEPARATOR);

    if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error('Malformed encrypted payload');
    }

    const [, ivBase64, authTagBase64, ciphertextBase64] = parts;

    const key = deriveKey(cryptoKey);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextBase64, 'base64')),
        decipher.final(),
    ]);

    return plaintext.toString('utf8');
}

export interface Rs256KeyPair {
    publicKey: string;
    privateKey: string;
}

// Generates an RS256 (RSA-2048) key pair as PEM strings — the key material every Embed token is
// signed (private key) and validated (public key) with. 2048-bit modulus is the RS256 baseline.
export function generateRs256KeyPair(): Rs256KeyPair {
    const {publicKey, privateKey} = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {type: 'spki', format: 'pem'},
        privateKeyEncoding: {type: 'pkcs8', format: 'pem'},
    });

    return {publicKey, privateKey};
}
