import {encryptString, generateRs256KeyPair} from '../../../components/crypto';
import {CryptoKeyMissingError, EmbeddingSecretNotExistsError} from '../../../components/errors';
import {DEFAULT_QUERY_TIMEOUT} from '../../../const';
import {
    EmbeddingSecretModel,
    EmbeddingSecretModelColumn,
} from '../../../db/models/new/embedding-secret';
import Utils from '../../../utils';
import {ServiceArgs} from '../types';
import {getPrimary} from '../utils';

import {checkWorkbookEmbedPermission, getWorkbookDataLensSecret} from './utils';

export interface RotateEmbeddingSecretArgs {
    workbookId: string;
}

// Rotates the workbook's Embedding secret to invalidate every existing Embed at once (ticket 06 / spec
// US-16). A fresh RS256 key pair replaces the old one in place, so every token DataLens previously signed
// with the old private key stops verifying against the new public key and fails closed at the anonymous
// resolve. Existing Embed rows keep pointing at the same (rotated) secret; Embeds created afterwards are
// signed with the new key. Restricted to workbook editors and above. Rotation acts only on an existing
// DataLens-issued secret — a workbook with none has no Embeds to invalidate, so this fails not-found
// rather than minting fresh key material.
export const rotateEmbeddingSecret = async (
    {ctx, trx}: ServiceArgs,
    {workbookId}: RotateEmbeddingSecretArgs,
) => {
    ctx.log('ROTATE_EMBEDDING_SECRET_START', {workbookId: Utils.encodeId(workbookId)});

    const {cryptoKey} = ctx.config;

    if (!cryptoKey) {
        // Fail before touching key material we could not store safely.
        throw new CryptoKeyMissingError();
    }

    const targetTrx = getPrimary(trx);

    // "Editors and above" — rotating the secret is a destructive, workbook-wide action; a viewer cannot
    // invalidate a workbook's embeddings.
    await checkWorkbookEmbedPermission({ctx, trx: targetTrx}, {workbookId});

    const existing = await getWorkbookDataLensSecret(targetTrx, workbookId);

    if (!existing) {
        // Nothing to rotate — the workbook has no DataLens-issued secret, hence no Embeds to invalidate.
        throw new EmbeddingSecretNotExistsError();
    }

    const {publicKey, privateKey} = generateRs256KeyPair();

    const model = await EmbeddingSecretModel.query(targetTrx)
        .patch({
            [EmbeddingSecretModelColumn.PublicKey]: publicKey,
            [EmbeddingSecretModelColumn.PrivateKey]: encryptString(privateKey, cryptoKey),
        })
        .where({
            [EmbeddingSecretModelColumn.EmbeddingSecretId]: existing.embeddingSecretId,
        })
        .returning('*')
        .first()
        .timeout(DEFAULT_QUERY_TIMEOUT);

    if (!model) {
        // The row we just selected vanished under us (concurrent delete) — nothing to return.
        throw new EmbeddingSecretNotExistsError();
    }

    ctx.log('ROTATE_EMBEDDING_SECRET_SUCCESS', {
        embeddingSecretId: Utils.encodeId(existing.embeddingSecretId),
    });

    return model;
};
