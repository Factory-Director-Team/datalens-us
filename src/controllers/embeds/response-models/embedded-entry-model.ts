import type {AppContext} from '@gravity-ui/nodekit';

import {z} from '../../../components/zod';
import type {ResolveEmbeddedEntryResult} from '../../../services/new/embed';
import {getEntryResult} from '../../entries/response-models/get-entry-model';

import {embedModel} from './embed-model';

// The anonymous embedded-entry read hands the UI gateway everything it needs to render and to enforce
// parameters: the decoded token (with the locked `params`), the Embed's param config, and the object.
const schema = z
    .object({
        token: z.object({
            embedId: z.string(),
            iat: z.number().optional(),
            // Locked parameter values baked into the token — enforced as constants on every render.
            params: z.record(z.string(), z.unknown()).optional(),
        }),
        embed: embedModel.schema,
        entry: getEntryResult.schema,
    })
    .describe('Embedded entry (token, embed, entry)');

export type EmbeddedEntryResponseModel = z.infer<typeof schema>;

const format = (
    ctx: AppContext,
    result: ResolveEmbeddedEntryResult,
): EmbeddedEntryResponseModel => ({
    token: result.token,
    embed: embedModel.format(result.embed),
    entry: getEntryResult.format(ctx, result.entry),
});

export const embeddedEntryModel = {
    schema,
    format,
};
