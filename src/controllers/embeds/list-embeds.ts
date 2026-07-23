import {withContract} from '@gravity-ui/expresskit';

import {ApiTag} from '../../components/api-docs';
import {z, zc} from '../../components/zod';
import {listEmbeds} from '../../services/new/embed';

import {listEmbedsModel} from './response-models';

// List the Embeds that already exist for an object (ticket 06). Restricted to workbook editors and above
// — enforced in the service — so a viewer cannot enumerate a workbook's embeddings.
export const listEmbedsController = withContract({
    operationId: 'listEmbeds',
    summary: 'List the embeds for an entry',
    tags: [ApiTag.Embeds],
    request: {
        query: z.object({
            entryId: zc.encodedId(),
        }),
    },
    response: {
        content: {
            200: {
                schema: listEmbedsModel.schema,
                description: 'The embeds that exist for the entry',
            },
        },
    },
})(async (req, res) => {
    const {entryId} = req.query;

    const embeds = await listEmbeds({ctx: req.ctx}, {entryId});

    res.sendTyped(200, listEmbedsModel.format(embeds));
});

listEmbedsController.manualDecodeId = true;
