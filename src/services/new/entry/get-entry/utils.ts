import {AppContext} from '@gravity-ui/nodekit';
import {TransactionOrKnex} from 'objection';

import {AccessServicePermissionDeniedError} from '../../../../components/errors';
import {Entry as EntryModel, EntryColumn} from '../../../../db/models/new/entry';
import {EntryScope} from '../../../../db/models/new/entry/types';
import {Link, LinkColumn} from '../../../../db/models/new/link';
import {WorkbookModel} from '../../../../db/models/new/workbook';
import {WorkbookPermission} from '../../../../entities/workbook';
import {getParentIds} from '../../collection/utils';
import {getReplica} from '../../utils';
import {getEntryPermissionsByWorkbook} from '../../workbook/utils';
import {CollectionEntryPermissions, resolveCollectionEntryPermissions} from '../collection-entry';

import {
    ENTITY_BINDING_QUERY_TIMEOUT,
    ENTRY_QUERY_TIMEOUT,
    GET_PARENTS_QUERY_TIMEOUT,
    WORKBOOK_QUERY_TIMEOUT,
} from './constants';
import {SelectedEntry} from './types';

export const checkWorkbookEntry = async ({
    ctx,
    trx,
    entry,
    workbook,
    includePermissionsInfo,
}: {
    ctx: AppContext;
    trx?: TransactionOrKnex;
    entry: SelectedEntry;
    workbook: WorkbookModel;
    includePermissionsInfo?: boolean;
}) => {
    let parentIds: string[] = [];

    if (workbook.collectionId !== null) {
        parentIds = await getParentIds({
            ctx,
            trx: getReplica(trx),
            collectionId: workbook.collectionId,
            getParentsQueryTimeout: GET_PARENTS_QUERY_TIMEOUT,
        });
    }

    const registry = ctx.get('registry');

    const {Workbook} = registry.common.classes.get();

    const workbookInstance = new Workbook({
        ctx,
        model: workbook,
    });

    const {accessServiceEnabled} = ctx.config;

    if (accessServiceEnabled) {
        if (includePermissionsInfo) {
            await workbookInstance.fetchAllPermissions({parentIds});

            if (!workbookInstance.permissions?.[WorkbookPermission.LimitedView]) {
                throw new AccessServicePermissionDeniedError();
            }
        } else {
            await workbookInstance.checkPermission({
                parentIds,
                permission: WorkbookPermission.LimitedView,
            });
        }
    } else {
        workbookInstance.enableAllPermissions();
    }

    if (includePermissionsInfo) {
        return getEntryPermissionsByWorkbook({
            workbook: workbookInstance,
            scope: entry.scope,
        });
    }

    return undefined;
};

// Authorizes an anonymous read of a dependent CHART when it is referenced by a PUBLIC dashboard. A chart
// inside a public dashboard is not itself flagged public, so the public-read path authorizes it via the
// links graph: the entry must be a `toId` of the dashboard (`fromId`), the `fromId` must be a public,
// non-deleted `dash`, and the `toId` (the entry being read) must itself be a `widget` (chart). The two
// scope checks keep exposure to exactly "a dashboard's dependent charts": a public *chart* cannot unlock
// what it links to, and a dashboard cannot unlock a non-chart it links to (e.g. a selector's dataset).
// Fails closed — any missing/mismatching row yields false, so only genuine chart dependencies of a
// genuinely public dashboard pass. Both ids are decoded (as stored in `links`). See ADR 0002 / ticket 03.
export const checkPublicDashDependency = async ({
    trx,
    entryId,
    publicDashId,
}: {
    trx?: TransactionOrKnex;
    entryId: string;
    publicDashId: string;
}): Promise<boolean> => {
    const dependency = await Link.query(getReplica(trx))
        .join(
            `${EntryModel.tableName} as dash`,
            `dash.${EntryColumn.EntryId}`,
            `${Link.tableName}.${LinkColumn.FromId}`,
        )
        .join(
            `${EntryModel.tableName} as dep`,
            `dep.${EntryColumn.EntryId}`,
            `${Link.tableName}.${LinkColumn.ToId}`,
        )
        .where(`${Link.tableName}.${LinkColumn.FromId}`, publicDashId)
        .andWhere(`${Link.tableName}.${LinkColumn.ToId}`, entryId)
        .andWhere(`dash.${EntryColumn.Public}`, true)
        .andWhere(`dash.${EntryColumn.Scope}`, EntryScope.Dash)
        .andWhere(`dash.${EntryColumn.IsDeleted}`, false)
        .andWhere(`dep.${EntryColumn.Scope}`, EntryScope.Widget)
        .andWhere(`dep.${EntryColumn.IsDeleted}`, false)
        .first()
        .timeout(ENTRY_QUERY_TIMEOUT);

    return Boolean(dependency);
};

export const checkCollectionEntry = async ({
    ctx,
    trx,
    entry,
    permission,
    includePermissionsInfo,
    skipCheckPermissions,
}: {
    ctx: AppContext;
    trx?: TransactionOrKnex;
    entry: SelectedEntry;
    permission: CollectionEntryPermissions;
    includePermissionsInfo?: boolean;
    skipCheckPermissions?: boolean;
}) => {
    return await resolveCollectionEntryPermissions(
        {ctx, trx},
        {
            entry: entry as unknown as EntryModel,
            permission,
            includePermissions: includePermissionsInfo,
            skipCheckPermissions,
            getEntityBindingsQueryTimeout: ENTITY_BINDING_QUERY_TIMEOUT,
            getParentsQueryTimeout: GET_PARENTS_QUERY_TIMEOUT,
            getEntryQueryTimeout: ENTRY_QUERY_TIMEOUT,
            getWorkbookQueryTimeout: WORKBOOK_QUERY_TIMEOUT,
        },
    );
};
