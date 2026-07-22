import type {Knex} from 'knex';

// DataLens signs Embed tokens itself, so it must hold the private half of every workbook Embedding
// secret alongside the public key (ADR 0003 — deviation from upstream, which stores only public_key
// and expects an external app to sign). The private key is stored encrypted at rest with the stack
// crypto key; the column is a plain TEXT holding the serialized ciphertext. Nullable so pre-existing
// (upstream/subscription) secret rows remain valid.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE embedding_secrets ADD COLUMN private_key TEXT;
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE embedding_secrets DROP COLUMN private_key;
    `);
}
