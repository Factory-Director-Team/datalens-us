import {withContract} from '@gravity-ui/expresskit';

import {ApiTag} from '../../components/api-docs';
import {z, zc} from '../../components/zod';
import {deleteEmbed} from '../../services/new/embed';

import {deleteEmbedModel} from './response-models';

// Delete (revoke) an Embed so its iframe stops rendering everywhere it is pasted (ticket 06). Restricted
// to workbook editors and above — enforced in the service. Once deleted the token fails closed as
// not-found at the anonymous resolve (ADR 0003 — revocation is by deleting the Embed).
export const deleteEmbedController = withContract({
    operationId: 'deleteEmbed',
    summary: 'Delete an embed',
    tags: [ApiTag.Embeds],
    request: {
        params: z.object({
            embedId: zc.encodedId(),
        }),
    },
    response: {
        content: {
            200: {
                schema: deleteEmbedModel.schema,
                description: 'The deleted embed id',
            },
        },
    },
})(async (req, res) => {
    const {embedId} = req.params;

    const result = await deleteEmbed({ctx: req.ctx}, {embedId});

    res.sendTyped(200, deleteEmbedModel.format(result));
});

deleteEmbedController.manualDecodeId = true;
