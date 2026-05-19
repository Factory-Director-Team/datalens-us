import type {CheckEmbedding, GetEmbeddingWorkbookId} from './types';

export const checkEmbedding: CheckEmbedding = ({ctx}) => Boolean(ctx.get('embedding'));

export const getEmbeddingWorkbookId: GetEmbeddingWorkbookId = ({ctx}) => {
    const embedding = ctx.get('embedding');
    if (!embedding?.workbookId) {
        return null;
    }
    return String(embedding.workbookId);
};
