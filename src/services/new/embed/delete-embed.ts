import {AppError} from '@gravity-ui/nodekit';

import {US_ERRORS} from '../../../const';
import {EmbedModel, EmbedModelColumn} from '../../../db/models/new/embed';
import {JoinedEmbedEmbeddingSecret} from '../../../db/presentations/joined-embed-embedding-secret';
import Utils from '../../../utils';
import {getEntry} from '../entry/get-entry';
import type {ServiceArgs} from '../types';
import {getPrimary, getReplica} from '../utils';

export async function deleteEmbed({ctx}: ServiceArgs, embedId: string) {
    const row = await JoinedEmbedEmbeddingSecret.findOne({
        trx: getReplica(),
        where: {
            [`${EmbedModel.tableName}.${EmbedModelColumn.EmbedId}`]: embedId,
        },
    });

    if (!row) {
        throw new AppError(US_ERRORS.NOT_EXIST_ENTRY, {code: US_ERRORS.NOT_EXIST_ENTRY});
    }

    const entryId = String(row.entryId);

    const {permissions} = await getEntry(
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

    if (!permissions?.edit && !permissions?.admin) {
        throw new AppError(US_ERRORS.ENTRIES_WITH_INSUFFICIENT_PERMISSIONS, {
            code: US_ERRORS.ENTRIES_WITH_INSUFFICIENT_PERMISSIONS,
        });
    }

    await EmbedModel.query(getPrimary()).deleteById(embedId);

    return {embedId: Utils.encodeId(embedId)};
}
