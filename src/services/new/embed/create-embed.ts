import * as crypto from 'crypto';

import {AppError} from '@gravity-ui/nodekit';
import {transaction} from 'objection';

import {US_ERRORS} from '../../../const';
import {EmbedModel, EmbedModelColumn} from '../../../db/models/new/embed';
import {EmbeddingSecretModel} from '../../../db/models/new/embedding-secret';
import {JoinedEmbedEmbeddingSecret} from '../../../db/presentations/joined-embed-embedding-secret';
import Utils from '../../../utils';
import {getEntry} from '../entry/get-entry';
import type {ServiceArgs} from '../types';
import {getPrimary} from '../utils';

import {signEmbedToken} from './embed-jwt';

export type CreateEmbedBody = {
    title: string;
    entryId: string;
    depsIds: string[];
    unsignedParams: string[];
    privateParams: string[];
    publicParamsMode: boolean;
    settings?: Record<string, unknown>;
    embeddingSecretId?: string;
    allowAllDeps?: boolean;
    /** Override default TTL from config (seconds). 0 = no expiry. */
    ttlSeconds?: number;
};

function randomSecret() {
    return crypto.randomBytes(48).toString('base64url');
}

export async function createEmbed({ctx}: ServiceArgs, body: CreateEmbedBody) {
    const {
        title,
        entryId,
        depsIds,
        unsignedParams,
        privateParams,
        publicParamsMode,
        settings = {},
        embeddingSecretId,
        allowAllDeps = false,
        ttlSeconds,
    } = body;

    const {user} = ctx.get('info');
    const userId = user.userId;
    const author = user.login || userId;

    const mainEntry = await getEntry(
        {ctx},
        {
            entryId,
            branch: 'published',
            includePermissionsInfo: true,
            includeTenantSettings: false,
            includeServicePlan: false,
            includeTenantFeatures: false,
            includeFavorite: false,
            includeLinks: false,
        },
    );

    const perms = mainEntry.permissions;
    if (!perms?.edit && !perms?.admin) {
        throw new AppError(US_ERRORS.ENTRIES_WITH_INSUFFICIENT_PERMISSIONS, {
            code: US_ERRORS.ENTRIES_WITH_INSUFFICIENT_PERMISSIONS,
        });
    }

    const wb = mainEntry.entry.workbookId;
    if (!wb) {
        throw new AppError(
            'Private embedding is only supported for entries inside a workbook',
            {
                code: US_ERRORS.VALIDATION_ERROR,
            },
        );
    }

    const workbookId = wb;
    const tenantId = mainEntry.entry.tenantId;
    if (!tenantId) {
        throw new AppError(US_ERRORS.NOT_EXIST_TENANT, {code: US_ERRORS.NOT_EXIST_TENANT});
    }

    for (const depId of depsIds) {
        const depEntry = await getEntry(
            {ctx},
            {
                entryId: depId,
                branch: 'published',
                includePermissionsInfo: false,
                includeTenantSettings: false,
                includeServicePlan: false,
                includeTenantFeatures: false,
                includeFavorite: false,
                includeLinks: false,
            },
        );
        if (String(depEntry.entry.workbookId) !== String(workbookId)) {
            throw new AppError('All dependencies must belong to the same workbook', {
                code: US_ERRORS.NOT_MATCH_TOGETHER,
            });
        }
    }

    return transaction(getPrimary(), async (trx) => {
        let secretRow: EmbeddingSecretModel;

        if (embeddingSecretId) {
            const found = await EmbeddingSecretModel.query(trx).findById(embeddingSecretId);
            if (!found || String(found.workbookId) !== String(workbookId)) {
                throw new AppError('Embedding secret not found for workbook', {
                    code: US_ERRORS.NOT_EXIST_CONFIG,
                });
            }
            secretRow = found;
        } else {
            const existing = await EmbeddingSecretModel.query(trx)
                .where({workbookId})
                .limit(1)
                .first();
            if (existing) {
                secretRow = existing;
            } else {
                secretRow = await EmbeddingSecretModel.query(trx).insertAndFetch({
                    title: 'default',
                    workbookId,
                    tenantId,
                    publicKey: randomSecret(),
                    createdBy: author,
                } as any);
            }
        }

        const embedRow = await EmbedModel.query(trx).insertAndFetch({
            title,
            embeddingSecretId: secretRow.embeddingSecretId,
            entryId,
            tenantId,
            depsIds,
            unsignedParams,
            privateParams,
            publicParamsMode,
            allowAllDeps,
            settings,
            createdBy: author,
            updatedBy: author,
        } as any);

        const joined = await JoinedEmbedEmbeddingSecret.findOne({
            trx,
            where: {
                [`${EmbedModel.tableName}.${EmbedModelColumn.EmbedId}`]: embedRow.embedId,
            },
        });

        if (!joined) {
            throw new AppError(US_ERRORS.NOT_EXIST_ENTRY, {code: US_ERRORS.NOT_EXIST_ENTRY});
        }

        const embedIdEnc = Utils.encodeId(embedRow.embedId);

        const embedToken = signEmbedToken(ctx, {
            secret: secretRow.publicKey,
            embedIdEncoded: embedIdEnc,
            ttlSeconds,
        });

        return {joined, embedToken};
    });
}
