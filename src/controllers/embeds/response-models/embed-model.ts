import {z} from '../../../components/zod';
import type {EmbedModel} from '../../../db/models/new/embed';
import Utils from '../../../utils';

const schema = z
    .object({
        embedId: z.string(),
        title: z.string(),
        embeddingSecretId: z.string(),
        entryId: z.string(),
        depsIds: z.array(z.string()),
        unsignedParams: z.array(z.string()),
        privateParams: z.array(z.string()),
        publicParamsMode: z.boolean(),
        settings: z.record(z.string(), z.unknown()),
        createdBy: z.string(),
        createdAt: z.string(),
        updatedBy: z.string(),
        updatedAt: z.string(),
    })
    .describe('Embed model');

export type EmbedResponseModel = z.infer<typeof schema>;

// Structural view of the columns the presentation returns — works for both the full EmbedModel (create)
// and the joined embed+secret projection (resolve).
type FormattableEmbed = Pick<
    EmbedModel,
    | 'embedId'
    | 'title'
    | 'embeddingSecretId'
    | 'entryId'
    | 'depsIds'
    | 'unsignedParams'
    | 'privateParams'
    | 'publicParamsMode'
    | 'settings'
    | 'createdBy'
    | 'createdAt'
    | 'updatedBy'
    | 'updatedAt'
>;

const format = (model: FormattableEmbed): EmbedResponseModel => ({
    embedId: Utils.encodeId(model.embedId),
    title: model.title,
    embeddingSecretId: Utils.encodeId(model.embeddingSecretId),
    entryId: Utils.encodeId(model.entryId),
    depsIds: (model.depsIds ?? []).map((id) => Utils.encodeId(id)),
    unsignedParams: model.unsignedParams ?? [],
    privateParams: model.privateParams ?? [],
    publicParamsMode: model.publicParamsMode,
    settings: model.settings ?? {},
    createdBy: model.createdBy,
    createdAt: model.createdAt,
    updatedBy: model.updatedBy,
    updatedAt: model.updatedAt,
});

export const embedModel = {
    schema,
    format,
};
