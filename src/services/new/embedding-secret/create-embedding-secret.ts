import Utils from '../../../utils';
import {ServiceArgs} from '../types';
import {getPrimary} from '../utils';

import {checkWorkbookEmbedPermission, mintEmbeddingSecret} from './utils';

const DEFAULT_TITLE = 'Embedding secret';

export interface CreateEmbeddingSecretArgs {
    workbookId: string;
    title?: string;
}

// Creates a workbook Embedding secret: an RS256 key pair DataLens holds both halves of. The public
// key validates Embed tokens, the private key signs them and is stored encrypted at rest with the
// stack crypto key (ADR 0003). Restricted to users with the workbook Embed permission — which the
// access model grants to editors and above; viewers cannot create one (spec: "editors and above").
export const createEmbeddingSecret = async (
    {ctx, trx}: ServiceArgs,
    {workbookId, title = DEFAULT_TITLE}: CreateEmbeddingSecretArgs,
) => {
    ctx.log('CREATE_EMBEDDING_SECRET_START', {workbookId: Utils.encodeId(workbookId)});

    const targetTrx = getPrimary(trx);

    await checkWorkbookEmbedPermission({ctx, trx: targetTrx}, {workbookId});

    const model = await mintEmbeddingSecret({ctx, trx: targetTrx}, {workbookId, title});

    ctx.log('CREATE_EMBEDDING_SECRET_SUCCESS', {
        embeddingSecretId: Utils.encodeId(model.embeddingSecretId),
    });

    return model;
};
