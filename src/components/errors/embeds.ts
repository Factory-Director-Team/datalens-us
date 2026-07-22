import {definePresentableError} from './define';

// The resolved Embed does not exist (unknown embedId, or the Embed / its secret was deleted). Returned
// on the anonymous embedded-entry read so a stale iframe fails closed without leaking whether the id
// ever existed (ADR 0003 — revocation is by deleting the Embed).
export class EmbedNotExistsError extends definePresentableError({
    code: 'EMBED_NOT_EXISTS',
    httpCode: 404,
    message: "The embed doesn't exist",
}) {}

// The Embed token is malformed, carries no embedId, or its RS256 signature does not verify against the
// embedding secret's public key (a forged or tampered token). Rejected without returning the object.
export class InvalidEmbedTokenError extends definePresentableError({
    code: 'INVALID_EMBED_TOKEN',
    httpCode: 400,
    message: 'The embed token is invalid',
}) {}
