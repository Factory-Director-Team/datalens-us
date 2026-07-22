import {DEFAULT_QUERY_TIMEOUT} from '../../../const';
import {
    EmbeddingSecretModel,
    EmbeddingSecretModelColumn,
} from '../../../db/models/new/embedding-secret';
import {mintEmbeddingSecret} from '../embedding-secret/utils';
import {ServiceArgs} from '../types';
import {getPrimary} from '../utils';

const DEFAULT_TITLE = 'Embedding secret';

export interface GetOrCreateEmbeddingSecretArgs {
    workbookId: string;
}

// Lazily materializes the workbook's Embedding secret the first time an Embed is created (spec US-15):
// reuse the workbook's existing DataLens-issued secret (one that carries a private key we hold — never
// an upstream/subscription secret, which stores only a public key), otherwise mint a fresh RS256 pair.
// Callers MUST enforce the workbook Embed permission BEFORE calling this — it does no permission check.
export const getOrCreateEmbeddingSecret = async (
    {ctx, trx}: ServiceArgs,
    {workbookId}: GetOrCreateEmbeddingSecretArgs,
) => {
    const targetTrx = getPrimary(trx);

    const existing = await EmbeddingSecretModel.query(targetTrx)
        .where({
            [EmbeddingSecretModelColumn.WorkbookId]: workbookId,
            [EmbeddingSecretModelColumn.Type]: null,
        })
        .whereNotNull(EmbeddingSecretModelColumn.PrivateKey)
        .orderBy(EmbeddingSecretModelColumn.CreatedAt, 'desc')
        .first()
        .timeout(DEFAULT_QUERY_TIMEOUT);

    if (existing) {
        return existing;
    }

    return mintEmbeddingSecret({ctx, trx: targetTrx}, {workbookId, title: DEFAULT_TITLE});
};
