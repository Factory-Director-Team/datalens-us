import type {AppContext} from '@gravity-ui/nodekit';
import {AppError} from '@gravity-ui/nodekit';

import {US_ERRORS} from '../../../const';
import type {GetEntryResult} from '../entry/get-entry';
import {getEntry} from '../entry/get-entry';

import {assertEntryWorkbookMatchesEmbed, assertRequestedEntryMatchesEmbed} from './embed-access';
import type {DecodedEmbedToken} from './embed-jwt';
import {verifyEmbedToken} from './embed-jwt';
import {formatEmbedForApi} from './format-embed-api';

export type EmbeddedDashPayload = {
    token: DecodedEmbedToken;
    embed: ReturnType<typeof formatEmbedForApi>;
    entryResult: GetEntryResult;
};

export async function loadEmbeddedDashPayload(
    ctx: AppContext,
    args: {
        rawToken: string | undefined;
        includeServicePlan?: boolean;
        includeTenantFeatures?: boolean;
        includeTenantSettings?: boolean;
    },
): Promise<EmbeddedDashPayload> {
    const {row, tokenDecoded} = await verifyEmbedToken(ctx, args.rawToken);
    const mainEntryId = String(row.entryId);

    ctx.set('embedding', {
        workbookId: row.workbookId,
        embedRow: row,
    });

    try {
        const entryResult = await getEntry(
            {ctx},
            {
                entryId: mainEntryId,
                branch: 'published',
                includePermissionsInfo: true,
                includeLinks: true,
                includeServicePlan: args.includeServicePlan,
                includeTenantFeatures: args.includeTenantFeatures,
                includeTenantSettings: args.includeTenantSettings ?? true,
                includeFavorite: false,
            },
        );

        if (!entryResult.entry.tenantId || String(entryResult.entry.tenantId) !== String(row.tenantId)) {
            throw new AppError(US_ERRORS.NOT_EXIST_ENTRY, {code: US_ERRORS.NOT_EXIST_ENTRY});
        }

        await assertEntryWorkbookMatchesEmbed({
            entryWorkbookId: entryResult.entry.workbookId,
            embedWorkbookId: String(row.workbookId),
        });

        return {
            token: tokenDecoded,
            embed: formatEmbedForApi(row),
            entryResult,
        };
    } finally {
        ctx.set('embedding', undefined);
    }
}

export async function loadEmbeddedEntryByIdPayload(
    ctx: AppContext,
    args: {
        entryIdDecoded: string;
        rawToken: string | undefined;
        includeServicePlan?: boolean;
        includeTenantFeatures?: boolean;
        includeTenantSettings?: boolean;
    },
): Promise<{
    embeddingInfo: {token: EmbeddedDashPayload['token']; embed: EmbeddedDashPayload['embed']};
    entryResult: GetEntryResult;
}> {
    const {row, tokenDecoded} = await verifyEmbedToken(ctx, args.rawToken);

    assertRequestedEntryMatchesEmbed(row, args.entryIdDecoded);

    ctx.set('embedding', {
        workbookId: row.workbookId,
        embedRow: row,
    });

    try {
        const entryResult = await getEntry(
            {ctx},
            {
                entryId: args.entryIdDecoded,
                branch: 'published',
                includePermissionsInfo: true,
                includeLinks: true,
                includeServicePlan: args.includeServicePlan,
                includeTenantFeatures: args.includeTenantFeatures,
                includeTenantSettings: args.includeTenantSettings ?? true,
                includeFavorite: false,
            },
        );

        if (!entryResult.entry.tenantId || String(entryResult.entry.tenantId) !== String(row.tenantId)) {
            throw new AppError(US_ERRORS.NOT_EXIST_ENTRY, {code: US_ERRORS.NOT_EXIST_ENTRY});
        }

        await assertEntryWorkbookMatchesEmbed({
            entryWorkbookId: entryResult.entry.workbookId,
            embedWorkbookId: String(row.workbookId),
        });

        return {
            embeddingInfo: {
                token: tokenDecoded,
                embed: formatEmbedForApi(row),
            },
            entryResult,
        };
    } finally {
        ctx.set('embedding', undefined);
    }
}
