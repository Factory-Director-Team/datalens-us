import {withContract} from '@gravity-ui/expresskit';

import {ApiTag} from '../../components/api-docs';
import {z, zc} from '../../components/zod';
import {getEmbeddingSecret} from '../../services/new/embedding-secret';

import {embeddingSecretModel} from './response-models';

// Retrieve a workbook Embedding secret's public key for Embed-token validation. Returns the public
// key and metadata only; the encrypted private key is never surfaced.
export const getEmbeddingSecretController = withContract({
    operationId: 'getEmbeddingSecret',
    summary: 'Get a workbook embedding secret',
    tags: [ApiTag.Embeds],
    request: {
        params: z.object({
            embeddingSecretId: zc.encodedId(),
        }),
    },
    response: {
        content: {
            200: {
                schema: embeddingSecretModel.schema,
                description: 'The embedding secret (public key only)',
            },
        },
    },
})(async (req, res) => {
    const {embeddingSecretId} = req.params;

    const model = await getEmbeddingSecret({ctx: req.ctx}, {embeddingSecretId});

    res.sendTyped(200, embeddingSecretModel.format(model));
});

getEmbeddingSecretController.manualDecodeId = true;
