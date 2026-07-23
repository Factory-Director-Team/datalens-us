import jwt from 'jsonwebtoken';
import request from 'supertest';

import {decryptString, generateRs256KeyPair} from '../../../../../../components/crypto';
import {
    EmbeddingSecretModel,
    EmbeddingSecretModelColumn,
} from '../../../../../../db/models/new/embedding-secret';
import {routes} from '../../../../routes';
import {app, appConfig, auth} from '../../auth';
import {createMockWorkbook} from '../../helpers';
import {OpensourceRole} from '../../roles';

let workbookId: string;

describe('Create embedding secret', () => {
    test('Setup', async () => {
        const workbook = await createMockWorkbook();
        workbookId = workbook.workbookId;
    });

    test('A viewer cannot create an embedding secret', async () => {
        await auth(request(app).post(routes.embeddingSecrets), {role: OpensourceRole.Viewer})
            .send({workbookId})
            .expect(403);
    });

    test('An editor creates an embedding secret with an RS256 public key, and no private key is returned', async () => {
        const response = await auth(request(app).post(routes.embeddingSecrets), {
            role: OpensourceRole.Editor,
        })
            .send({workbookId})
            .expect(200);

        expect(response.body.embeddingSecretId).toEqual(expect.any(String));
        expect(response.body.workbookId).toBe(workbookId);
        expect(response.body.publicKey).toContain('-----BEGIN PUBLIC KEY-----');

        // The private key must never be surfaced by a read endpoint.
        expect(response.body.privateKey).toBeUndefined();
        expect(JSON.stringify(response.body)).not.toContain('PRIVATE KEY');
    });

    test('The generated key pair is a valid RS256 pair (private key signs, returned public key verifies)', async () => {
        const {body: created} = await auth(request(app).post(routes.embeddingSecrets), {
            role: OpensourceRole.Editor,
        })
            .send({workbookId})
            .expect(200);

        const row = await EmbeddingSecretModel.query(EmbeddingSecretModel.primary)
            .where({[EmbeddingSecretModelColumn.PublicKey]: created.publicKey})
            .first();

        const encryptedPrivateKey = row?.privateKey as string;
        const privateKeyPem = decryptString(encryptedPrivateKey, appConfig.cryptoKey as string);

        const token = jwt.sign({embedId: 'test'}, privateKeyPem, {algorithm: 'RS256'});

        // Verifying with the returned public key proves the halves match and the algorithm is RS256.
        const decoded = jwt.verify(token, created.publicKey, {algorithms: ['RS256']});
        expect(decoded).toMatchObject({embedId: 'test'});

        // A key that does not belong to the pair must not verify.
        const {publicKey: strangerPublicKey} = generateRs256KeyPair();
        expect(() => jwt.verify(token, strangerPublicKey, {algorithms: ['RS256']})).toThrow();
    });

    test('The private key is stored encrypted at rest, not in plaintext', async () => {
        const {body: created} = await auth(request(app).post(routes.embeddingSecrets), {
            role: OpensourceRole.Editor,
        })
            .send({workbookId})
            .expect(200);

        const row = await EmbeddingSecretModel.query(EmbeddingSecretModel.primary)
            .where({[EmbeddingSecretModelColumn.PublicKey]: created.publicKey})
            .first();

        const storedPrivateKey = row?.privateKey as string;

        // Stored value is the versioned ciphertext, not the PEM private key.
        expect(storedPrivateKey).toEqual(expect.any(String));
        expect(storedPrivateKey.startsWith('v1:')).toBe(true);
        expect(storedPrivateKey).not.toContain('PRIVATE KEY');

        // It decrypts back to a usable PKCS8 private key with the stack crypto key.
        const decrypted = decryptString(storedPrivateKey, appConfig.cryptoKey as string);
        expect(decrypted).toContain('-----BEGIN PRIVATE KEY-----');
    });

    test('The public key is retrievable for token validation, without the private key', async () => {
        const {body: created} = await auth(request(app).post(routes.embeddingSecrets), {
            role: OpensourceRole.Editor,
        })
            .send({workbookId})
            .expect(200);

        const response = await auth(
            request(app).get(routes.embeddingSecret(created.embeddingSecretId)),
        ).expect(200);

        expect(response.body.embeddingSecretId).toBe(created.embeddingSecretId);
        expect(response.body.workbookId).toBe(workbookId);
        expect(response.body.publicKey).toBe(created.publicKey);

        expect(response.body.privateKey).toBeUndefined();
        expect(JSON.stringify(response.body)).not.toContain('PRIVATE KEY');
    });
});
