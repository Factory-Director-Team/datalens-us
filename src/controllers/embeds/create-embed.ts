import {withContract} from '@gravity-ui/expresskit';

import {ApiTag} from '../../components/api-docs';
import {z, zc} from '../../components/zod';
import {createEmbed} from '../../services/new/embed';

import {createEmbedModel} from './response-models';

// Create an Embed for a chart and return a ready-to-paste, DataLens-signed token (ADR 0003). The
// object stays private — creating an Embed never sets entry.public. Restricted to workbook editors and
// above; the permission and the lazy get-or-create of the workbook Embedding secret are in the service.
export const createEmbedController = withContract({
    operationId: 'createEmbed',
    summary: 'Create an embed for an entry',
    tags: [ApiTag.Embeds],
    request: {
        body: z.object({
            entryId: zc.encodedId(),
            title: z.string().optional(),
            depsIds: z.array(zc.encodedId()).optional(),
            // Parameter names an embedder may override through the iframe URL (the "open" allowlist).
            unsignedParams: z.array(z.string()).optional(),
            // Parameter names locked away from the URL (kept on the record for the publisher's UI).
            privateParams: z.array(z.string()).optional(),
            // Locked parameter values signed into the token and enforced as constants on every render.
            signedParams: z.record(z.string(), z.unknown()).optional(),
            publicParamsMode: z.boolean().optional(),
            settings: z.record(z.string(), z.unknown()).optional(),
        }),
    },
    response: {
        content: {
            200: {
                schema: createEmbedModel.schema,
                description: 'The created embed and its signed token',
            },
        },
    },
})(async (req, res) => {
    const {
        entryId,
        title,
        depsIds,
        unsignedParams,
        privateParams,
        signedParams,
        publicParamsMode,
        settings,
    } = req.body;

    const result = await createEmbed(
        {ctx: req.ctx},
        {
            entryId,
            title,
            depsIds,
            unsignedParams,
            privateParams,
            signedParams,
            publicParamsMode,
            settings,
        },
    );

    res.sendTyped(200, createEmbedModel.format(result));
});

createEmbedController.manualDecodeId = true;
