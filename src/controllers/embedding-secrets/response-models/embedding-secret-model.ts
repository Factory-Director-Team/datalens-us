import {z} from '../../../components/zod';
import type {EmbeddingSecretModel as EmbeddingSecretDbModel} from '../../../db/models/new/embedding-secret';
import Utils from '../../../utils';

// Public projection of an Embedding secret. Deliberately omits the (encrypted) private key so it can
// never be surfaced by any read endpoint (ADR 0003).
const schema = z
    .object({
        embeddingSecretId: z.string(),
        workbookId: z.string(),
        title: z.string(),
        publicKey: z.string(),
        createdBy: z.string(),
        createdAt: z.string(),
    })
    .describe('Embedding secret model (public key only)');

export type EmbeddingSecretResponseModel = z.infer<typeof schema>;

const format = (model: EmbeddingSecretDbModel): EmbeddingSecretResponseModel => ({
    embeddingSecretId: Utils.encodeId(model.embeddingSecretId),
    workbookId: Utils.encodeId(model.workbookId),
    title: model.title,
    publicKey: model.publicKey,
    createdBy: model.createdBy,
    createdAt: model.createdAt,
});

export const embeddingSecretModel = {
    schema,
    format,
};
