import {raw} from 'objection';

import {NotExistEntryError, WorkbookNotExistsError} from '../../../../components/errors';
import {CURRENT_TIMESTAMP, DEFAULT_QUERY_TIMEOUT} from '../../../../const';
import {Entry, EntryColumn} from '../../../../db/models/new/entry';
import {WorkbookPermission} from '../../../../entities/workbook';
import {makeUserId} from '../../../../utils';
import {getParentIds} from '../../collection/utils';
import {ServiceArgs} from '../../types';
import {getPrimary, getReplica} from '../../utils';
import {getWorkbook} from '../../workbook';

type SwitchPublicationStatusArgs = {
    entryId: string;
    publish: boolean;
};

// Flips entry.public for a workbook chart/dashboard. Restricted to users with edit (Update) rights on
// the entry's workbook — publishing exposes data to anonymous viewers, so it is not open to viewers
// (spec: "workbook editors and above").
export const switchPublicationStatus = async (
    {ctx, trx}: ServiceArgs,
    {entryId, publish}: SwitchPublicationStatusArgs,
) => {
    ctx.log('SWITCH_PUBLICATION_STATUS_START', {publish});

    const {user} = ctx.get('info');
    const {accessServiceEnabled} = ctx.config;

    const targetTrx = getPrimary(trx);

    const entry = await Entry.query(getReplica(trx))
        .where({
            [EntryColumn.EntryId]: entryId,
            [EntryColumn.IsDeleted]: false,
        })
        .first()
        .timeout(DEFAULT_QUERY_TIMEOUT);

    if (!entry) {
        throw new NotExistEntryError();
    }

    if (!entry.workbookId) {
        // Publishing collection/navigation entries is out of scope for this feature.
        throw new WorkbookNotExistsError();
    }

    const workbook = await getWorkbook(
        {ctx, trx: targetTrx, skipValidation: true, skipCheckPermissions: true},
        {workbookId: entry.workbookId},
    );

    if (accessServiceEnabled) {
        let parentIds: string[] = [];

        if (workbook.model.collectionId !== null) {
            parentIds = await getParentIds({
                ctx,
                trx: targetTrx,
                collectionId: workbook.model.collectionId,
            });
        }

        await workbook.checkPermission({
            parentIds,
            permission: WorkbookPermission.Update,
        });
    }

    const updatedEntry = await Entry.query(targetTrx)
        .patch({
            [EntryColumn.Public]: publish,
            [EntryColumn.UpdatedBy]: makeUserId(user.userId),
            [EntryColumn.UpdatedAt]: raw(CURRENT_TIMESTAMP),
        })
        .where({
            [EntryColumn.EntryId]: entryId,
            [EntryColumn.IsDeleted]: false,
        })
        .returning('*')
        .first()
        .timeout(DEFAULT_QUERY_TIMEOUT);

    if (!updatedEntry) {
        throw new NotExistEntryError();
    }

    ctx.log('SWITCH_PUBLICATION_STATUS_SUCCESS');

    return updatedEntry;
};
