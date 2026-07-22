import {z} from '../../../components/zod';
import type {CreateEmbedResult} from '../../../services/new/embed';

import {embedModel} from './embed-model';

// The create response is the Embed record plus the signed token DataLens issued for it (ADR 0003) — the
// token the publisher drops straight into the iframe snippet, so the UI never has to sign anything.
const schema = embedModel.schema
    .extend({
        token: z.string().describe('Signed RS256 Embed token for the iframe snippet'),
    })
    .describe('Created embed with its signed token');

export type CreateEmbedResponseModel = z.infer<typeof schema>;

const format = (result: CreateEmbedResult): CreateEmbedResponseModel => ({
    ...embedModel.format(result.embed),
    token: result.token,
});

export const createEmbedModel = {
    schema,
    format,
};
