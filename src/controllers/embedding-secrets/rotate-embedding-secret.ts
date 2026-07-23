import {withContract} from '@gravity-ui/expresskit';

import {ApiTag} from '../../components/api-docs';
import {z, zc} from '../../components/zod';
import {rotateEmbeddingSecret} from '../../services/new/embedding-secret';

import {embeddingSecretModel} from './response-models';

// Rotate a workbook's Embedding secret to invalidate every existing Embed at once (ticket 06). Replaces
// the RS256 key pair in place so previously-signed tokens stop verifying. Restricted to workbook editors
// and above — enforced in the service. The response carries the public key only, never the private key.
export const rotateEmbeddingSecretController = withContract({
    operationId: 'rotateEmbeddingSecret',
    summary: 'Rotate a workbook embedding secret',
    tags: [ApiTag.Embeds],
    request: {
        body: z.object({
            workbookId: zc.encodedId(),
        }),
    },
    response: {
        content: {
            200: {
                schema: embeddingSecretModel.schema,
                description: 'The rotated embedding secret (public key only)',
            },
        },
    },
})(async (req, res) => {
    const {workbookId} = req.body;

    const model = await rotateEmbeddingSecret({ctx: req.ctx}, {workbookId});

    res.sendTyped(200, embeddingSecretModel.format(model));
});

rotateEmbeddingSecretController.manualDecodeId = true;
