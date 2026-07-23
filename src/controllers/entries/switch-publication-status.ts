import {withContract} from '@gravity-ui/expresskit';

import {ApiTag} from '../../components/api-docs';
import {z, zc} from '../../components/zod';
import {switchPublicationStatus} from '../../services/new/entry';

// Publish / unpublish a chart or dashboard. Sets entry.public; the anonymous public-read endpoint
// then serves (publish) or 404s (unpublish) the entry. Edit rights on the workbook are enforced in
// the service.
export const switchPublicationStatusController = withContract({
    operationId: 'switchEntryPublicationStatus',
    summary: 'Switch entry publication (public) status',
    tags: [ApiTag.Entries],
    request: {
        params: z.object({
            entryId: zc.encodedId(),
        }),
        body: z.object({
            publish: z.boolean(),
        }),
    },
    response: {
        content: {
            200: {
                schema: z.object({
                    public: z.boolean(),
                }),
                description: 'Updated publication status',
            },
        },
    },
})(async (req, res) => {
    const {entryId} = req.params;
    const {publish} = req.body;

    const updatedEntry = await switchPublicationStatus({ctx: req.ctx}, {entryId, publish});

    res.sendTyped(200, {public: updatedEntry.public});
});

switchPublicationStatusController.manualDecodeId = true;
