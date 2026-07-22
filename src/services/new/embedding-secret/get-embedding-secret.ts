import {EmbeddingSecretNotExistsError} from '../../../components/errors';
import {DEFAULT_QUERY_TIMEOUT} from '../../../const';
import {
    EmbeddingSecretModel,
    EmbeddingSecretModelColumn,
} from '../../../db/models/new/embedding-secret';
import Utils from '../../../utils';
import {ServiceArgs} from '../types';
import {getReplica} from '../utils';
import {getWorkbook} from '../workbook';

export interface GetEmbeddingSecretArgs {
    embeddingSecretId: string;
}

// Reads an Embedding secret for token validation. Returns the public key and metadata only — the
// encrypted private key is never surfaced. Access is scoped to the owning workbook: getWorkbook
// enforces read (LimitedView) permission, so a caller who cannot see the workbook cannot learn a
// secret exists.
export const getEmbeddingSecret = async (
    {ctx, trx}: ServiceArgs,
    {embeddingSecretId}: GetEmbeddingSecretArgs,
) => {
    ctx.log('GET_EMBEDDING_SECRET_START', {
        embeddingSecretId: Utils.encodeId(embeddingSecretId),
    });

    const model = await EmbeddingSecretModel.query(getReplica(trx))
        .where({[EmbeddingSecretModelColumn.EmbeddingSecretId]: embeddingSecretId})
        .first()
        .timeout(DEFAULT_QUERY_TIMEOUT);

    if (!model) {
        throw new EmbeddingSecretNotExistsError();
    }

    await getWorkbook({ctx, trx}, {workbookId: model.workbookId});

    ctx.log('GET_EMBEDDING_SECRET_SUCCESS');

    return model;
};
