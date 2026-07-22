import {EmbedNotExistsError} from '../../../components/errors';
import {JoinedEmbedEmbeddingSecretColumns} from '../../../db/presentations/joined-embed-embedding-secret';
import {GetEntryResult, getEntry} from '../entry';
import {checkEmbeddedDashDependency} from '../entry/get-entry/utils';
import {ServiceArgs} from '../types';

import {EmbedTokenPayload, verifyEmbedToken} from './verify-embed-token';

export interface ResolveEmbeddedDependencyArgs {
    token: string;
    // Decoded id of the dependent entry requested within the Embed's scope (a chart on the dashboard).
    entryId: string;
    includeServicePlan?: boolean;
    includeTenantFeatures?: boolean;
    includeTenantSettings?: boolean;
}

export interface ResolveEmbeddedDependencyResult {
    token: EmbedTokenPayload;
    embed: JoinedEmbedEmbeddingSecretColumns;
    entry: GetEntryResult;
}

// Resolves a dependent entry of an embedded DASHBOARD (ticket 05) — the authoritative gate for anonymous
// rendering of an embedded dashboard's charts (ADR 0002). An Embed token authorizes exactly its own
// object; for a dashboard embed that object is a dashboard whose dependent charts are NOT themselves
// embedded, so each chart is fetched here by id under the same token. This verifies the token, then
// authorizes the requested entry as a genuine widget dependency of the embed's dashboard via the links
// graph (only when the embed opts into serving all its dependencies, allowAllDeps — set for dashboards).
// The embed's own object is always resolvable. Anything else — including another object in the same
// workbook that the dashboard does not depend on — fails closed as not-found, so an Embed never becomes a
// key to the rest of the workbook (spec US-14).
export const resolveEmbeddedDependency = async (
    {ctx, trx}: ServiceArgs,
    {
        token,
        entryId,
        includeServicePlan,
        includeTenantFeatures,
        includeTenantSettings,
    }: ResolveEmbeddedDependencyArgs,
): Promise<ResolveEmbeddedDependencyResult> => {
    ctx.log('RESOLVE_EMBEDDED_DEPENDENCY_START');

    const {decoded, embed} = await verifyEmbedToken({ctx, trx}, {token});

    if (embed.entryId !== entryId) {
        const authorized =
            embed.allowAllDeps &&
            (await checkEmbeddedDashDependency({
                trx,
                entryId,
                embeddedDashId: embed.entryId,
            }));

        if (!authorized) {
            throw new EmbedNotExistsError();
        }
    }

    const entry = await getEntry(
        {ctx, trx},
        {
            entryId,
            // The dependency is authorized above; scope to the Embed's workbook and bypass the tenant /
            // permission / public gates exactly as the single-object resolve does.
            embeddingWorkbookId: embed.workbookId,
            includeLinks: true,
            includeServicePlan,
            includeTenantFeatures,
            includeTenantSettings,
        },
    );

    ctx.log('RESOLVE_EMBEDDED_DEPENDENCY_SUCCESS', {embedId: decoded.embedId});

    return {
        token: decoded,
        embed,
        entry,
    };
};
