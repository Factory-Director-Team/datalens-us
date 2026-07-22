import {encryptString, generateRs256KeyPair} from '../../../components/crypto';
import {CryptoKeyMissingError} from '../../../components/errors';
import {DEFAULT_QUERY_TIMEOUT} from '../../../const';
import {
    EmbeddingSecretModel,
    EmbeddingSecretModelColumn,
} from '../../../db/models/new/embedding-secret';
import {WorkbookPermission} from '../../../entities/workbook';
import Utils from '../../../utils';
import {getParentIds} from '../collection/utils';
import {ServiceArgs} from '../types';
import {getPrimary} from '../utils';
import {getWorkbook} from '../workbook';

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

    const {
        user: {userId},
        tenantId,
    } = ctx.get('info');
    const {accessServiceEnabled, cryptoKey} = ctx.config;

    if (!cryptoKey) {
        // Fail before generating a key we could not store safely.
        throw new CryptoKeyMissingError();
    }

    const targetTrx = getPrimary(trx);

    const workbook = await getWorkbook(
        {ctx, trx: targetTrx, skipValidation: true, skipCheckPermissions: true},
        {workbookId},
    );

    if (accessServiceEnabled) {
        let parentIds: string[] = [];

        if (workbook.model.collectionId !== null) {
            parentIds = await getParentIds({
                ctx,
                trx: targetTrx,
                collectionId: workbook.model.collectionId,
            });
        }

        await workbook.checkPermission({
            parentIds,
            permission: WorkbookPermission.Embed,
        });
    }

    const {publicKey, privateKey} = generateRs256KeyPair();

    const model = await EmbeddingSecretModel.query(targetTrx)
        .insert({
            [EmbeddingSecretModelColumn.Title]: title,
            [EmbeddingSecretModelColumn.WorkbookId]: workbookId,
            [EmbeddingSecretModelColumn.TenantId]: tenantId,
            [EmbeddingSecretModelColumn.PublicKey]: publicKey,
            [EmbeddingSecretModelColumn.PrivateKey]: encryptString(privateKey, cryptoKey),
            [EmbeddingSecretModelColumn.CreatedBy]: userId,
        })
        .returning('*')
        .timeout(DEFAULT_QUERY_TIMEOUT);

    ctx.log('CREATE_EMBEDDING_SECRET_SUCCESS', {
        embeddingSecretId: Utils.encodeId(model.embeddingSecretId),
    });

    return model;
};
