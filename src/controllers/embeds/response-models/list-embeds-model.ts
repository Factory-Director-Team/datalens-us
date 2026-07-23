import {z} from '../../../components/zod';
import type {EmbedModel} from '../../../db/models/new/embed';

import {embedModel} from './embed-model';

// The list response is a plain array of Embed records for the object (ticket 06) — no signed token is
// included, since tokens are issued once at create time and never stored (ADR 0003).
const schema = z.array(embedModel.schema).describe('Embeds for the entry');

export type ListEmbedsResponseModel = z.infer<typeof schema>;

const format = (models: EmbedModel[]): ListEmbedsResponseModel => models.map(embedModel.format);

export const listEmbedsModel = {
    schema,
    format,
};
