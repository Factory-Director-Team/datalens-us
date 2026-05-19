import {Request, Response} from '@gravity-ui/expresskit';

import {makeReqParser, z, zc} from '../../components/zod';
import {DL_EMBED_TOKEN_HEADER} from '../../const/common';
import {createEmbed, type CreateEmbedBody} from '../../services/new/embed/create-embed';
import {deleteEmbed} from '../../services/new/embed/delete-embed';
import {loadEmbeddedDashPayload, loadEmbeddedEntryByIdPayload} from '../../services/new/embed/embedded-entry-payload';
import {formatEmbedForApi} from '../../services/new/embed/format-embed-api';
import {listEmbedsForEntry} from '../../services/new/embed/list-embeds';
import {isTrueArg} from '../../utils/env-utils';

import {getEntryResult} from '../entries/get-entry/response-model';

const createBodySchema = z.object({
    title: z.string(),
    entryId: zc.encodedId(),
    embeddingSecretId: zc.encodedId().optional(),
    depsIds: z.array(zc.encodedId()),
    unsignedParams: z.array(z.string()),
    privateParams: z.array(z.string()),
    publicParamsMode: z.boolean(),
    settings: z.record(z.string(), z.unknown()).optional(),
    allowAllDeps: z.boolean().optional(),
    ttlSeconds: z.number().int().min(0).optional(),
});

const createParse = makeReqParser({body: createBodySchema});

const listParse = makeReqParser({
    query: z.object({
        entryId: zc.encodedId(),
    }),
});

const deleteParse = makeReqParser({
    params: z.object({
        embedId: zc.encodedId(),
    }),
});

const embeddedEntryQuerySchema = z.object({
    includeServicePlan: zc.stringBoolean().optional(),
    includeTenantFeatures: zc.stringBoolean().optional(),
    includeTenantSettings: zc.stringBoolean().optional(),
});

const embeddedEntryParse = makeReqParser({
    query: embeddedEntryQuerySchema,
});

const embedEntryByIdParse = makeReqParser({
    params: z.object({
        entryId: zc.encodedId(),
    }),
    query: embeddedEntryQuerySchema,
});

export const createEmbedController = async (req: Request, res: Response) => {
    const {body} = (await createParse(req)) as {body: CreateEmbedBody};
    const {joined, embedToken} = await createEmbed({ctx: req.ctx}, body);

    res.status(201).send({
        ...formatEmbedForApi(joined),
        embedToken,
    });
};

export const listEmbedsController = async (req: Request, res: Response) => {
    const {query} = await listParse(req);
    const list = await listEmbedsForEntry({ctx: req.ctx}, query.entryId);
    res.status(200).send(list);
};

export const deleteEmbedController = async (req: Request, res: Response) => {
    const {params} = await deleteParse(req);
    const result = await deleteEmbed({ctx: req.ctx}, params.embedId);
    res.status(200).send(result);
};

export const embeddedEntryController = async (req: Request, res: Response) => {
    const {query} = await embeddedEntryParse(req);
    const rawToken = req.headers[DL_EMBED_TOKEN_HEADER];
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

    const payload = await loadEmbeddedDashPayload(req.ctx, {
        rawToken: token,
        includeServicePlan: isTrueArg(query.includeServicePlan),
        includeTenantFeatures: isTrueArg(query.includeTenantFeatures),
        includeTenantSettings:
            query.includeTenantSettings === undefined ? true : isTrueArg(query.includeTenantSettings),
    });

    res.status(200).send({
        token: payload.token,
        embed: payload.embed,
        entry: getEntryResult.format(req.ctx, payload.entryResult),
    });
};

export const getEmbedEntryByIdController = async (req: Request, res: Response) => {
    const {params, query} = await embedEntryByIdParse(req);
    const rawToken = req.headers[DL_EMBED_TOKEN_HEADER];
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

    const {embeddingInfo, entryResult} = await loadEmbeddedEntryByIdPayload(req.ctx, {
        entryIdDecoded: params.entryId,
        rawToken: token,
        includeServicePlan: isTrueArg(query.includeServicePlan),
        includeTenantFeatures: isTrueArg(query.includeTenantFeatures),
        includeTenantSettings:
            query.includeTenantSettings === undefined ? true : isTrueArg(query.includeTenantSettings),
    });

    res.status(200).send({
        ...getEntryResult.format(req.ctx, entryResult),
        embeddingInfo,
    });
};

createEmbedController.manualDecodeId = true;
listEmbedsController.manualDecodeId = true;
deleteEmbedController.manualDecodeId = true;
getEmbedEntryByIdController.manualDecodeId = true;
