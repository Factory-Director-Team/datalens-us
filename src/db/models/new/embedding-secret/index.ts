import {Model} from '../../..';
import type {EmbeddingType} from '../shared';

export const EmbeddingSecretModelColumn = {
    EmbeddingSecretId: 'embeddingSecretId',
    Title: 'title',
    WorkbookId: 'workbookId',
    TenantId: 'tenantId',
    PublicKey: 'publicKey',
    // Serialized ciphertext of the RS256 private key, encrypted at rest with the stack crypto key
    // (ADR 0003). Never returned in plaintext by any read endpoint. Nullable: upstream/subscription
    // secrets carry only a public key.
    PrivateKey: 'privateKey',
    Type: 'type',
    CreatedBy: 'createdBy',
    CreatedAt: 'createdAt',
} as const;

export class EmbeddingSecretModel extends Model {
    static get tableName() {
        return 'embedding_secrets';
    }

    static get idColumn() {
        return EmbeddingSecretModelColumn.EmbeddingSecretId;
    }

    [EmbeddingSecretModelColumn.EmbeddingSecretId]!: string;
    [EmbeddingSecretModelColumn.Title]!: string;
    [EmbeddingSecretModelColumn.WorkbookId]!: string;
    [EmbeddingSecretModelColumn.TenantId]!: string;
    [EmbeddingSecretModelColumn.PublicKey]!: string;
    [EmbeddingSecretModelColumn.PrivateKey]!: Nullable<string>;
    [EmbeddingSecretModelColumn.Type]!: Nullable<EmbeddingType>;
    [EmbeddingSecretModelColumn.CreatedBy]!: string;
    [EmbeddingSecretModelColumn.CreatedAt]!: string;
}
