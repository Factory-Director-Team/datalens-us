import type {JoinedEmbedEmbeddingSecretColumns} from '../../../db/presentations/joined-embed-embedding-secret';
import Utils from '../../../utils';

export function formatEmbedForApi(row: JoinedEmbedEmbeddingSecretColumns) {
    return {
        embedId: Utils.encodeId(row.embedId),
        title: row.title,
        embeddingSecretId: Utils.encodeId(row.embeddingSecretId),
        entryId: Utils.encodeId(row.entryId),
        depsIds: (row.depsIds || []).map((id) => Utils.encodeId(id)),
        unsignedParams: row.unsignedParams || [],
        privateParams: row.privateParams || [],
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
        publicParamsMode: row.publicParamsMode,
        settings: row.settings || {},
    };
}
