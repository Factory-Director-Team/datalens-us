import {definePresentableError} from './define';

export class EmbeddingSecretNotExistsError extends definePresentableError({
    code: 'EMBEDDING_SECRET_NOT_EXISTS',
    httpCode: 404,
    message: "The embedding secret doesn't exist",
}) {}

// Server misconfiguration: the stack crypto key is required to encrypt the private key at rest but is
// not wired into US. Surfaced as 500 so the operator fixes configuration rather than a caller retrying.
export class CryptoKeyMissingError extends definePresentableError({
    code: 'CRYPTO_KEY_MISSING',
    httpCode: 500,
    message: 'Crypto key is not configured',
}) {}
