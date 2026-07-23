import {NotExistEntryError} from '../../../components/errors';
import {DEFAULT_QUERY_TIMEOUT} from '../../../const';
import {EmbedModel, EmbedModelColumn} from '../../../db/models/new/embed';
import {Entry, EntryColumn} from '../../../db/models/new/entry';
import Utils from '../../../utils';
import {checkWorkbookEmbedPermission} from '../embedding-secret/utils';
import {ServiceArgs} from '../types';
import {getReplica} from '../utils';

export interface ListEmbedsArgs {
    entryId: string;
}

// Lists the Embeds that already exist for an object so a workbook editor can see what is currently
// published (ticket 06 / spec US-11). Restricted to workbook editors and above — the same gate that
// guards creating an Embed — so a viewer cannot enumerate a workbook's embeddings. Returns the Embed
// records only; the signed token is never stored or re-derived here (it is issued once at create time,
// ADR 0003).
export const listEmbeds = async (
    {ctx, trx}: ServiceArgs,
    {entryId}: ListEmbedsArgs,
): Promise<EmbedModel[]> => {
    ctx.log('LIST_EMBEDS_START', {entryId: Utils.encodeId(entryId)});

    const replicaTrx = getReplica(trx);

    const entry = await Entry.query(replicaTrx)
        .select([EntryColumn.WorkbookId])
        .where({
            [EntryColumn.EntryId]: entryId,
            [EntryColumn.IsDeleted]: false,
        })
        .first()
        .timeout(DEFAULT_QUERY_TIMEOUT);

    if (!entry || !entry.workbookId) {
        // Only workbook objects can be embedded; a missing (or non-workbook) entry has no embeds.
        throw new NotExistEntryError();
    }

    // "Editors and above" — listing a workbook's embeddings is an editor capability, not a viewer one.
    // The permission helper resolves the primary connection itself, so authorization is never read off a
    // lagging replica even though the list data is.
    await checkWorkbookEmbedPermission({ctx, trx}, {workbookId: entry.workbookId});

    const embeds = await EmbedModel.query(replicaTrx)
        .where({[EmbedModelColumn.EntryId]: entryId})
        .orderBy(EmbedModelColumn.CreatedAt, 'desc')
        .timeout(DEFAULT_QUERY_TIMEOUT);

    ctx.log('LIST_EMBEDS_SUCCESS', {count: embeds.length});

    return embeds;
};
