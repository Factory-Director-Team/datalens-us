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

// Low-level: is `depId` a non-deleted `widget` (chart) that the non-deleted dashboard `dashId` links to?
// The dash-scope + widget-scope checks bound exposure to exactly "a dashboard's dependent charts": a
// *chart* cannot unlock what it links to (its `fromId` is not a `dash`), and a dashboard cannot unlock a
// non-chart it links to (e.g. a selector's dataset/connection). `requirePublicDash` additionally demands
// the dashboard be flagged public — the public-read path (ticket 03) authorizes solely on that flag,
// whereas the embed path (ticket 05) authorizes the dashboard via a verified Embed token instead and so
// leaves it off. Fails closed — any missing/mismatching row yields false. Both ids are decoded (as stored
// in `links`). See ADR 0002.
const checkDashWidgetDependency = async ({
    trx,
    dashId,
    depId,
    requirePublicDash,
}: {
    trx?: TransactionOrKnex;
    dashId: string;
    depId: string;
    requirePublicDash: boolean;
}): Promise<boolean> => {
    const query = Link.query(getReplica(trx))
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
        .where(`${Link.tableName}.${LinkColumn.FromId}`, dashId)
        .andWhere(`${Link.tableName}.${LinkColumn.ToId}`, depId)
        .andWhere(`dash.${EntryColumn.Scope}`, EntryScope.Dash)
        .andWhere(`dash.${EntryColumn.IsDeleted}`, false)
        .andWhere(`dep.${EntryColumn.Scope}`, EntryScope.Widget)
        .andWhere(`dep.${EntryColumn.IsDeleted}`, false);

    if (requirePublicDash) {
        query.andWhere(`dash.${EntryColumn.Public}`, true);
    }

    const dependency = await query.first().timeout(ENTRY_QUERY_TIMEOUT);

    return Boolean(dependency);
};

// Authorizes an anonymous read of a dependent CHART when it is referenced by a PUBLIC dashboard on the
// public-read path (ticket 03). The dashboard's `public` flag is the whole authorization here.
export const checkPublicDashDependency = ({
    trx,
    entryId,
    publicDashId,
}: {
    trx?: TransactionOrKnex;
    entryId: string;
    publicDashId: string;
}): Promise<boolean> =>
    checkDashWidgetDependency({trx, dashId: publicDashId, depId: entryId, requirePublicDash: true});

// Authorizes an anonymous read of a dependent CHART of an EMBEDDED dashboard (ticket 05). The dashboard
// itself is authorized by a verified Embed token upstream (not by `entry.public`), so no public flag is
// required — but exposure is still bounded to genuine widget dependencies of that exact dashboard.
export const checkEmbeddedDashDependency = ({
    trx,
    entryId,
    embeddedDashId,
}: {
    trx?: TransactionOrKnex;
    entryId: string;
    embeddedDashId: string;
}): Promise<boolean> =>
    checkDashWidgetDependency({
        trx,
        dashId: embeddedDashId,
        depId: entryId,
        requirePublicDash: false,
    });

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
