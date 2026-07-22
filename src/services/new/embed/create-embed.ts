import jwt from 'jsonwebtoken';

import {decryptString} from '../../../components/crypto';
import {CryptoKeyMissingError, NotExistEntryError} from '../../../components/errors';
import {DEFAULT_QUERY_TIMEOUT} from '../../../const';
import {EmbedModel, EmbedModelColumn} from '../../../db/models/new/embed';
import {Entry, EntryColumn} from '../../../db/models/new/entry';
import Utils from '../../../utils';
import {checkWorkbookEmbedPermission} from '../embedding-secret/utils';
import {ServiceArgs} from '../types';
import {getPrimary} from '../utils';

import {getOrCreateEmbeddingSecret} from './get-or-create-embedding-secret';

const DEFAULT_TITLE = 'Embed';

export interface CreateEmbedArgs {
    entryId: string;
    title?: string;
    depsIds?: string[];
    // Names of parameters an embedder may override through the iframe URL (the "open" allowlist).
    unsignedParams?: string[];
    // Names of parameters locked away from the URL (the "private" list). With publicParamsMode the
    // locked *values* travel in the token (`signedParams` below); this list is kept for the record.
    privateParams?: string[];
    // Name→value map baked into the signed token and enforced as constants on every render — the
    // publisher's locked slice. A forged token cannot reproduce these without the private key.
    signedParams?: Record<string, unknown>;
    publicParamsMode?: boolean;
    settings?: Record<string, unknown>;
}

export interface CreateEmbedResult {
    embed: EmbedModel;
    // The RS256 Embed token (non-expiring, ADR 0003) DataLens signs on the publisher's behalf. It is a
    // public bearer capability that goes into the iframe snippet — revoked by deleting the Embed.
    token: string;
}

// Creates an Embed for a chart and returns a ready-to-embed signed token. DataLens holds both halves of
// the workbook Embedding secret and signs the token itself (ADR 0003). Restricted to workbook editors
// and above (WorkbookPermission.Embed). Creating an Embed never flags the entry public — the object
// stays private and is reachable only through a valid token.
export const createEmbed = async (
    {ctx, trx}: ServiceArgs,
    {
        entryId,
        title = DEFAULT_TITLE,
        depsIds = [],
        unsignedParams = [],
        privateParams = [],
        signedParams,
        publicParamsMode = true,
        settings = {},
    }: CreateEmbedArgs,
): Promise<CreateEmbedResult> => {
    ctx.log('CREATE_EMBED_START', {entryId: Utils.encodeId(entryId)});

    const {
        user: {userId},
        tenantId,
    } = ctx.get('info');
    const {cryptoKey} = ctx.config;

    if (!cryptoKey) {
        throw new CryptoKeyMissingError();
    }

    const targetTrx = getPrimary(trx);

    const entry = await Entry.query(targetTrx)
        .select([EntryColumn.WorkbookId])
        .where({
            [EntryColumn.EntryId]: entryId,
            [EntryColumn.IsDeleted]: false,
        })
        .first()
        .timeout(DEFAULT_QUERY_TIMEOUT);

    if (!entry || !entry.workbookId) {
        // Only workbook charts can be embedded in this slice; a missing (or non-workbook) entry fails.
        throw new NotExistEntryError();
    }

    const {workbookId} = entry;

    // Enforce "editors and above" up front, before any key material is created or reused.
    await checkWorkbookEmbedPermission({ctx, trx: targetTrx}, {workbookId});

    const embeddingSecret = await getOrCreateEmbeddingSecret({ctx, trx: targetTrx}, {workbookId});

    const model = await EmbedModel.query(targetTrx)
        .insert({
            [EmbedModelColumn.Title]: title,
            [EmbedModelColumn.EmbeddingSecretId]: embeddingSecret.embeddingSecretId,
            [EmbedModelColumn.EntryId]: entryId,
            [EmbedModelColumn.TenantId]: tenantId,
            [EmbedModelColumn.DepsIds]: depsIds,
            [EmbedModelColumn.UnsignedParams]: unsignedParams,
            [EmbedModelColumn.PrivateParams]: privateParams,
            [EmbedModelColumn.PublicParamsMode]: publicParamsMode,
            [EmbedModelColumn.Settings]: settings,
            [EmbedModelColumn.CreatedBy]: userId,
            [EmbedModelColumn.UpdatedBy]: userId,
        })
        .returning('*')
        .timeout(DEFAULT_QUERY_TIMEOUT);

    const privateKeyPem = decryptString(embeddingSecret.privateKey as string, cryptoKey);

    // Non-expiring by design (ADR 0003): the token sits in static third-party HTML, so a short expiry
    // adds no security and would silently break pasted iframes. The embedId is the encoded id, matching
    // the id the resolution endpoint decodes and every other API surface exposes.
    const token = jwt.sign(
        {
            embedId: Utils.encodeId(model.embedId),
            ...(signedParams ? {params: signedParams} : {}),
        },
        privateKeyPem,
        {algorithm: 'RS256'},
    );

    ctx.log('CREATE_EMBED_SUCCESS', {embedId: Utils.encodeId(model.embedId)});

    return {embed: model, token};
};
