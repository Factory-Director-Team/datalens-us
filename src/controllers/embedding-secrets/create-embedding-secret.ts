import {withContract} from '@gravity-ui/expresskit';

import {ApiTag} from '../../components/api-docs';
import {z, zc} from '../../components/zod';
import {createEmbeddingSecret} from '../../services/new/embedding-secret';

import {embeddingSecretModel} from './response-models';

// Create a workbook Embedding secret (RS256 key pair). DataLens keeps both halves; the private key is
// stored encrypted. Restricted to workbook editors and above — enforced in the service. The response
// carries the public key only, never the private key.
export const createEmbeddingSecretController = withContract({
    operationId: 'createEmbeddingSecret',
    summary: 'Create a workbook embedding secret',
    tags: [ApiTag.Embeds],
    request: {
        body: z.object({
            workbookId: zc.encodedId(),
            title: z.string().optional(),
        }),
    },
    response: {
        content: {
            200: {
                schema: embeddingSecretModel.schema,
                description: 'The created embedding secret (public key only)',
            },
        },
    },
})(async (req, res) => {
    const {workbookId, title} = req.body;

    const model = await createEmbeddingSecret({ctx: req.ctx}, {workbookId, title});

    res.sendTyped(200, embeddingSecretModel.format(model));
});

createEmbeddingSecretController.manualDecodeId = true;
