import type {IncomingHttpHeaders} from 'http';

import {withContract} from '@gravity-ui/expresskit';

import {ApiTag} from '../../components/api-docs';
import {InvalidEmbedTokenError} from '../../components/errors';
import {z, zc} from '../../components/zod';
import {DL_EMBED_TOKEN_HEADER} from '../../const';
import {resolveEmbeddedEntry} from '../../services/new/embed';

import {embeddedEntryModel} from './response-models';

// Anonymous embedded-entry read. Called by the UI gateway on behalf of an unauthenticated viewer,
// carrying the Embed token in the `x-dl-embed-token` header. US is the authoritative gate (ADR 0002):
// it verifies the token's RS256 signature and returns exactly the Embed's (private) object — a forged
// or malformed token, or one for a deleted Embed, is rejected and no object is returned.
export const getEmbeddedEntryController = withContract({
    operationId: 'getEmbeddedEntry',
    summary: 'Resolve an embedded entry by its embed token',
    tags: [ApiTag.Embeds],
    request: {
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

    const {includeServicePlan, includeTenantFeatures, includeTenantSettings} = req.query;

    const result = await resolveEmbeddedEntry(
        {ctx: req.ctx},
        {token, includeServicePlan, includeTenantFeatures, includeTenantSettings},
    );

    res.sendTyped(200, embeddedEntryModel.format(req.ctx, result));
});

getEmbeddedEntryController.manualDecodeId = true;
