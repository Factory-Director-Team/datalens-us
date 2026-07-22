import {JoinedEmbedEmbeddingSecretColumns} from '../../../db/presentations/joined-embed-embedding-secret';
import {GetEntryResult, getEntry} from '../entry';
import {ServiceArgs} from '../types';

import {EmbedTokenPayload, verifyEmbedToken} from './verify-embed-token';

export interface ResolveEmbeddedEntryArgs {
    token: string;
    includeServicePlan?: boolean;
    includeTenantFeatures?: boolean;
    includeTenantSettings?: boolean;
}

export interface ResolveEmbeddedEntryResult {
    token: EmbedTokenPayload;
    embed: JoinedEmbedEmbeddingSecretColumns;
    entry: GetEntryResult;
}

// Resolves an Embed token to exactly its object (ticket 04) — the authoritative gate for anonymous embed
// rendering (ADR 0002). Verifies the token against the workbook's stored public key, then returns the
// (private) entry scoped to the Embed's workbook. A forged, tampered, or malformed token, or one for a
// deleted Embed, is rejected upstream and no object leaks.
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

    const {decoded, embed} = await verifyEmbedToken({ctx, trx}, {token});

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
        token: decoded,
        embed,
        entry,
    };
};
