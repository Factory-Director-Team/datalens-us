import {EmbedNotExistsError, NotExistEntryError} from '../../../components/errors';
import {DEFAULT_QUERY_TIMEOUT} from '../../../const';
import {EmbedModel, EmbedModelColumn} from '../../../db/models/new/embed';
import {Entry, EntryColumn} from '../../../db/models/new/entry';
import Utils from '../../../utils';
import {checkWorkbookEmbedPermission} from '../embedding-secret/utils';
import {ServiceArgs} from '../types';
import {getPrimary} from '../utils';

export interface DeleteEmbedArgs {
    embedId: string;
}

export interface DeleteEmbedResult {
    embedId: string;
}

// Deletes an Embed so its iframe stops rendering everywhere it is pasted (ticket 06 / spec US-12). The
// token carries the (encoded) embedId, so once the row is gone the anonymous resolve finds no Embed and
// fails closed as not-found (ADR 0003 — revocation is by deleting the Embed). Hard delete: the embeds
// table has no soft-delete column, and a lingering row would keep the token alive. Restricted to workbook
// editors and above, gated on the object's workbook exactly like creating an Embed.
export const deleteEmbed = async (
    {ctx, trx}: ServiceArgs,
    {embedId}: DeleteEmbedArgs,
): Promise<DeleteEmbedResult> => {
    ctx.log('DELETE_EMBED_START', {embedId: Utils.encodeId(embedId)});

    const targetTrx = getPrimary(trx);

    const embed = await EmbedModel.query(targetTrx)
        .select([EmbedModelColumn.EmbedId, EmbedModelColumn.EntryId])
        .where({[EmbedModelColumn.EmbedId]: embedId})
        .first()
        .timeout(DEFAULT_QUERY_TIMEOUT);

    if (!embed) {
        // Unknown Embed — nothing to revoke; fail closed as not-found.
        throw new EmbedNotExistsError();
    }

    const entry = await Entry.query(targetTrx)
        .select([EntryColumn.WorkbookId])
        .where({[EntryColumn.EntryId]: embed.entryId})
        .first()
        .timeout(DEFAULT_QUERY_TIMEOUT);

    if (!entry || !entry.workbookId) {
        throw new NotExistEntryError();
    }

    // "Editors and above" — deleting (revoking) an Embed is an editor capability; a viewer is rejected
    // before the row is touched.
    await checkWorkbookEmbedPermission({ctx, trx: targetTrx}, {workbookId: entry.workbookId});

    await EmbedModel.query(targetTrx)
        .delete()
        .where({[EmbedModelColumn.EmbedId]: embedId})
        .timeout(DEFAULT_QUERY_TIMEOUT);

    ctx.log('DELETE_EMBED_SUCCESS', {embedId: Utils.encodeId(embedId)});

    return {embedId};
};
