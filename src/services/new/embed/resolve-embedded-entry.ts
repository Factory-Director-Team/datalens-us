import jwt from 'jsonwebtoken';

import {EmbedNotExistsError, InvalidEmbedTokenError} from '../../../components/errors';
import {EmbedModel, EmbedModelColumn} from '../../../db/models/new/embed';
import {
    JoinedEmbedEmbeddingSecret,
    JoinedEmbedEmbeddingSecretColumns,
} from '../../../db/presentations/joined-embed-embedding-secret';
import Utils from '../../../utils';
import {GetEntryResult, getEntry} from '../entry';
import {ServiceArgs} from '../types';
import {getReplica} from '../utils';

export interface ResolveEmbeddedEntryArgs {
    token: string;
    includeServicePlan?: boolean;
    includeTenantFeatures?: boolean;
    includeTenantSettings?: boolean;
}

// The public Embed token is an RS256 JWT carrying the (encoded) embedId plus any locked params.
type EmbedTokenPayload = {embedId: string; iat?: number; params?: Record<string, unknown>};

export interface ResolveEmbeddedEntryResult {
    token: EmbedTokenPayload;
    embed: JoinedEmbedEmbeddingSecretColumns;
    entry: GetEntryResult;
}

// Resolves an Embed token to exactly its object (ticket 04) — the authoritative gate for anonymous
// embed rendering (ADR 0002). Decodes the token to find the Embed, verifies the RS256 signature against
// the workbook's stored public key, then returns the (private) entry scoped to the Embed's workbook.
// A forged, tampered, or malformed token, or one for a deleted Embed, is rejected and no object leaks.
export const resolveEmbeddedEntry = async (
    {ctx, trx}: ServiceArgs,
    {
        token,
        includeServicePlan,
        includeTenantFeatures,
        includeTenantSettings,
    }: ResolveEmbeddedEntryArgs,
): Promise<ResolveEmbeddedEntryResult> => {
    ctx.log('RESOLVE_EMBEDDED_ENTRY_START');

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
        // The signature is the security boundary: only DataLens holds the private key, so a token that
        // verifies against the stored public key was issued by us for this exact Embed and params.
        jwt.verify(token, embed.publicKey, {algorithms: ['RS256']});
    } catch (error) {
        ctx.logError('RESOLVE_EMBEDDED_ENTRY_INVALID_SIGNATURE', error);
        throw new InvalidEmbedTokenError();
    }

    const entry = await getEntry(
        {ctx, trx},
        {
            entryId: embed.entryId,
            // The validated token authorizes this Embed's object even though it is not flagged public;
            // scope to the Embed's workbook and bypass the tenant / permission gates.
            embeddingWorkbookId: embed.workbookId,
            includeLinks: true,
            includeServicePlan,
            includeTenantFeatures,
            includeTenantSettings,
        },
    );

    ctx.log('RESOLVE_EMBEDDED_ENTRY_SUCCESS', {embedId: decoded.embedId});

    return {
        token: {embedId: decoded.embedId, iat: decoded.iat, params: decoded.params},
        embed,
        entry,
    };
};
