import type {IncomingHttpHeaders} from 'http';

import {withContract} from '@gravity-ui/expresskit';

import {ApiTag} from '../../components/api-docs';
import {InvalidEmbedTokenError} from '../../components/errors';
import {z, zc} from '../../components/zod';
import {DL_EMBED_TOKEN_HEADER} from '../../const';
import {resolveEmbeddedDependency} from '../../services/new/embed';

import {embeddedEntryModel} from './response-models';

// Anonymous read of a dependent entry of an embedded DASHBOARD (ticket 05). Called by the UI gateway for
// an unauthenticated viewer rendering an embedded dashboard's charts, carrying the Embed token in the
// `x-dl-embed-token` header and the dependent entry's id in the path. US is the authoritative gate (ADR
// 0002): it verifies the token, then authorizes the requested entry as a genuine widget dependency of the
// embed's dashboard. Anything that is not such a dependency fails closed as not-found, so an Embed cannot
// be used to pull the rest of the workbook. The response mirrors the single-object embed read.
export const getEmbeddedDependencyController = withContract({
    operationId: 'getEmbeddedDependency',
    summary: 'Resolve a dependent entry of an embedded dashboard by its embed token and id',
    tags: [ApiTag.Embeds],
    request: {
        params: z.object({
            entryId: zc.encodedId(),
        }),
        // withContract replaces req.headers with the validated set, so the Embed token header must be
        // declared here to survive; passthrough keeps the rest of the request headers intact.
        headers: z
            .object({
                [DL_EMBED_TOKEN_HEADER]: z.string().optional(),
            })
            .passthrough(),
        query: z.object({
            includeServicePlan: zc.stringBoolean().optional(),
            includeTenantFeatures: zc.stringBoolean().optional(),
            includeTenantSettings: zc.stringBoolean().optional(),
        }),
    },
    response: {
        content: {
            200: {
                schema: embeddedEntryModel.schema,
                description: embeddedEntryModel.schema.description,
            },
        },
    },
})(async (req, res) => {
    // withContract narrows `req` and types `req.headers` as unknown; the Embed token is a plain header.
    const rawToken = (req.headers as IncomingHttpHeaders)[DL_EMBED_TOKEN_HEADER];
    const token = Array.isArray(rawToken) ? undefined : rawToken;

    if (!token) {
        throw new InvalidEmbedTokenError();
    }

    const {entryId} = req.params;
    const {includeServicePlan, includeTenantFeatures, includeTenantSettings} = req.query;

    const result = await resolveEmbeddedDependency(
        {ctx: req.ctx},
        {token, entryId, includeServicePlan, includeTenantFeatures, includeTenantSettings},
    );

    res.sendTyped(200, embeddedEntryModel.format(req.ctx, result));
});

getEmbeddedDependencyController.manualDecodeId = true;
