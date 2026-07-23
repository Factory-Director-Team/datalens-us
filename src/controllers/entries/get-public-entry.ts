import {withContract} from '@gravity-ui/expresskit';

import {ApiTag} from '../../components/api-docs';
import {z, zc} from '../../components/zod';
import {getEntry} from '../../services/new/entry';

import {getEntryResult} from './response-models/get-entry-model';

// Reads an entry for an anonymous public link. `onlyPublic: true` is forced here so this endpoint
// can ONLY ever return entries flagged public, even though it is called by the (trusted) UI gateway
// over the master token. See ADR 0002 — authorization is enforced authoritatively in US.
export const getPublicEntryController = withContract({
    operationId: 'getPublicEntry',
    summary: 'Get public entry',
    tags: [ApiTag.Entries],
    request: {
        params: z.object({
            entryId: zc.encodedId(),
        }),
        query: z.object({
            branch: z.enum(['saved', 'published']).optional(),
            revId: zc.encodedId().optional(),
            includeLinks: zc.stringBoolean().optional(),
            // Set when resolving a dependent chart of a public dashboard: authorizes this entry as a
            // dependency of the given public dashboard even if it is not itself public (ticket 03).
            publicDashId: zc.encodedId().optional(),
        }),
    },
    response: {
        content: {
            200: {
                schema: getEntryResult.schema,
                description: getEntryResult.schema.description,
            },
        },
    },
})(async (req, res) => {
    const {entryId} = req.params;
    const {branch, revId, includeLinks, publicDashId} = req.query;

    const result = await getEntry(
        {ctx: req.ctx},
        {
            entryId,
            branch,
            revId,
            includeLinks,
            onlyPublic: true,
            publicDashId,
        },
    );

    res.sendTyped(200, getEntryResult.format(req.ctx, result));
});

getPublicEntryController.manualDecodeId = true;
