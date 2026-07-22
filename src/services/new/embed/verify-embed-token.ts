import jwt from 'jsonwebtoken';

import {EmbedNotExistsError, InvalidEmbedTokenError} from '../../../components/errors';
import {EmbedModel, EmbedModelColumn} from '../../../db/models/new/embed';
import {
    JoinedEmbedEmbeddingSecret,
    JoinedEmbedEmbeddingSecretColumns,
} from '../../../db/presentations/joined-embed-embedding-secret';
import Utils from '../../../utils';
import {ServiceArgs} from '../types';
import {getReplica} from '../utils';

// The public Embed token is an RS256 JWT carrying the (encoded) embedId plus any locked params.
export type EmbedTokenPayload = {embedId: string; iat?: number; params?: Record<string, unknown>};

export interface VerifiedEmbedToken {
    decoded: EmbedTokenPayload;
    embed: JoinedEmbedEmbeddingSecretColumns;
}

// Decodes an Embed token, finds its Embed, and verifies the RS256 signature against the workbook's stored
// public key — the authoritative gate for anonymous embed rendering (ADR 0002/0003). The signature is the
// security boundary: only DataLens holds the private key, so a token that verifies was issued by us for
// exactly this Embed and its params. Fails closed on every path and never leaks the object: a token that
// is not a JWT or carries no embedId → InvalidEmbedTokenError; an embedId that does not decode, or an
// unknown/deleted Embed → EmbedNotExistsError; a forged or tampered signature → InvalidEmbedTokenError.
// Shared by the single-object resolve (ticket 04) and the dependent-entry resolve (ticket 05).
export const verifyEmbedToken = async (
    {ctx, trx}: ServiceArgs,
    {token}: {token: string},
): Promise<VerifiedEmbedToken> => {
    const decoded = jwt.decode(token);

    if (!decoded || typeof decoded === 'string' || typeof decoded.embedId !== 'string') {
        // Not a JWT, or one without an embedId — nothing to resolve.
        throw new InvalidEmbedTokenError();
    }

    let rawEmbedId: string;
    try {
        rawEmbedId = Utils.decodeId(decoded.embedId);
    } catch {
        // An embedId that does not decode to a real id maps to no Embed — fail closed as not-found
        // rather than leaking that the id was malformed.
        throw new EmbedNotExistsError();
    }

    const embed = await JoinedEmbedEmbeddingSecret.findOne({
        trx: getReplica(trx),
        where: {[`${EmbedModel.tableName}.${EmbedModelColumn.EmbedId}`]: rawEmbedId},
    });

    if (!embed) {
        // Unknown or deleted Embed — fail closed without revealing whether the id ever existed.
        throw new EmbedNotExistsError();
    }

    try {
        jwt.verify(token, embed.publicKey, {algorithms: ['RS256']});
    } catch (error) {
        ctx.logError('VERIFY_EMBED_TOKEN_INVALID_SIGNATURE', error);
        throw new InvalidEmbedTokenError();
    }

    return {
        decoded: {embedId: decoded.embedId, iat: decoded.iat, params: decoded.params},
        embed,
    };
};
