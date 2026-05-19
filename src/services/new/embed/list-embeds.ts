import {EmbedModel, EmbedModelColumn} from '../../../db/models/new/embed';
import {JoinedEmbedEmbeddingSecret} from '../../../db/presentations/joined-embed-embedding-secret';
import {getEntry} from '../entry/get-entry';
import type {ServiceArgs} from '../types';
import {getReplica} from '../utils';

import {formatEmbedForApi} from './format-embed-api';

export async function listEmbedsForEntry({ctx}: ServiceArgs, entryId: string) {
    await getEntry(
        {ctx},
        {
            entryId,
            branch: 'published',
            includePermissionsInfo: true,
            includeLinks: false,
            includeServicePlan: false,
            includeTenantFeatures: false,
            includeTenantSettings: false,
            includeFavorite: false,
        },
    );

    const rows = await JoinedEmbedEmbeddingSecret.find({
        trx: getReplica(),
        where: {
            [`${EmbedModel.tableName}.${EmbedModelColumn.EntryId}`]: entryId,
        },
    });

    return rows.map(formatEmbedForApi);
}
