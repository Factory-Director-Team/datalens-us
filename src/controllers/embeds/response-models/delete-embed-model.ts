import {z} from '../../../components/zod';
import type {DeleteEmbedResult} from '../../../services/new/embed';
import Utils from '../../../utils';

// The delete response echoes the (encoded) id of the revoked Embed so the caller can reconcile its list.
const schema = z
    .object({
        embedId: z.string(),
    })
    .describe('The deleted embed id');

export type DeleteEmbedResponseModel = z.infer<typeof schema>;

const format = (result: DeleteEmbedResult): DeleteEmbedResponseModel => ({
    embedId: Utils.encodeId(result.embedId),
});

export const deleteEmbedModel = {
    schema,
    format,
};
