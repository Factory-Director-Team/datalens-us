import {TransactionOrKnex} from 'objection';

import {encryptString, generateRs256KeyPair} from '../../../components/crypto';
import {CryptoKeyMissingError} from '../../../components/errors';
import {DEFAULT_QUERY_TIMEOUT} from '../../../const';
import {
    EmbeddingSecretModel,
    EmbeddingSecretModelColumn,
} from '../../../db/models/new/embedding-secret';
import {WorkbookPermission} from '../../../entities/workbook';
import {getParentIds} from '../collection/utils';
import {ServiceArgs} from '../types';
import {getPrimary} from '../utils';
import {getWorkbook} from '../workbook';

// Default title given to a DataLens-issued Embedding secret when a caller does not supply one. Shared so
// the lazy get-or-create, the explicit create, and rotation all name a fresh secret identically.
export const DEFAULT_EMBEDDING_SECRET_TITLE = 'Embedding secret';

// Finds the workbook's DataLens-issued Embedding secret — the one whose private key we hold (Type null,
// private key present). Upstream/subscription secrets carry only a public key and are never returned, so
// they are never signed with or rotated. Newest wins; returns undefined when the workbook has no DataLens
// secret yet. Shared by the lazy get-or-create (which mints one when absent) and rotation (which requires
// an existing one).
export const getWorkbookDataLensSecret = (trx: TransactionOrKnex, workbookId: string) =>
    EmbeddingSecretModel.query(trx)
        .where({
            [EmbeddingSecretModelColumn.WorkbookId]: workbookId,
            [EmbeddingSecretModelColumn.Type]: null,
        })
        .whereNotNull(EmbeddingSecretModelColumn.PrivateKey)
        .orderBy(EmbeddingSecretModelColumn.CreatedAt, 'desc')
        .first()
        .timeout(DEFAULT_QUERY_TIMEOUT);

// Enforces "editors and above" for creating embedding key material — both the Embedding secret itself
// (ticket 02) and an Embed (ticket 04) gate on the same workbook Embed permission. In opensource the
// permission maps to editor+; viewers are rejected.
export const checkWorkbookEmbedPermission = async (
    {ctx, trx}: ServiceArgs,
    {workbookId}: {workbookId: string},
) => {
    const targetTrx = getPrimary(trx);

    const workbook = await getWorkbook(
        {ctx, trx: targetTrx, skipValidation: true, skipCheckPermissions: true},
        {workbookId},
    );

    if (ctx.config.accessServiceEnabled) {
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
};

// Mints a workbook Embedding secret: an RS256 key pair DataLens holds both halves of. The public key
// validates Embed tokens, the private key signs them and is stored encrypted at rest with the stack
// crypto key (ADR 0003). Does NOT check permissions — callers gate with checkWorkbookEmbedPermission.
export const mintEmbeddingSecret = async (
    {ctx, trx}: ServiceArgs,
    {workbookId, title}: {workbookId: string; title: string},
) => {
    const {
        user: {userId},
        tenantId,
    } = ctx.get('info');
    const {cryptoKey} = ctx.config;

    if (!cryptoKey) {
        // Fail before generating a key we could not store safely.
        throw new CryptoKeyMissingError();
    }

    const {publicKey, privateKey} = generateRs256KeyPair();

    return EmbeddingSecretModel.query(getPrimary(trx))
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
};
