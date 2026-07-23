import {
    DEFAULT_EMBEDDING_SECRET_TITLE,
    getWorkbookDataLensSecret,
    mintEmbeddingSecret,
} from '../embedding-secret/utils';
import {ServiceArgs} from '../types';
import {getPrimary} from '../utils';

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

    const existing = await getWorkbookDataLensSecret(targetTrx, workbookId);

    if (existing) {
        return existing;
    }

    return mintEmbeddingSecret(
        {ctx, trx: targetTrx},
        {workbookId, title: DEFAULT_EMBEDDING_SECRET_TITLE},
    );
};
