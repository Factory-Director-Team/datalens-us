import jwt from 'jsonwebtoken';
import request from 'supertest';

import {decryptString, generateRs256KeyPair} from '../../../../../../components/crypto';
import {DL_EMBED_TOKEN_HEADER} from '../../../../../../const';
import {
    EmbeddingSecretModel,
    EmbeddingSecretModelColumn,
} from '../../../../../../db/models/new/embedding-secret';
import {Entry, EntryColumn} from '../../../../../../db/models/new/entry';
import Utils from '../../../../../../utils';
import {routes} from '../../../../routes';
import {app, appConfig, auth, authPrivateRoute} from '../../auth';
import {createMockWorkbook, createMockWorkbookEntry} from '../../helpers';
import {OpensourceRole} from '../../roles';

let workbookId: string;
let entryId: string;
let embedId: string;
let validToken: string;
let privateKeyPem: string;

const UNSIGNED_PARAMS = ['open'];
const PRIVATE_PARAMS = ['secret'];
const SIGNED_PARAMS = {locked: 'lockedValue'};

const getEmbeddedEntry = (token: string) =>
    authPrivateRoute(request(app).get(routes.embeddedEntry)).set(DL_EMBED_TOKEN_HEADER, token);

describe('Embed: single chart', () => {
    test('Setup: a workbook with a private chart', async () => {
        const workbook = await createMockWorkbook();
        workbookId = workbook.workbookId;

        const entry = await createMockWorkbookEntry({workbookId, name: 'Embeddable chart'});
        entryId = entry.entryId;
    });

    test('A viewer cannot create an embed', async () => {
        await auth(request(app).post(routes.embeds), {role: OpensourceRole.Viewer})
            .send({entryId})
            .expect(403);
    });

    test('An editor creates an embed and gets a signed token back', async () => {
        const response = await auth(request(app).post(routes.embeds), {role: OpensourceRole.Editor})
            .send({
                entryId,
                unsignedParams: UNSIGNED_PARAMS,
                privateParams: PRIVATE_PARAMS,
                signedParams: SIGNED_PARAMS,
                publicParamsMode: true,
            })
            .expect(200);

        expect(response.body.embedId).toEqual(expect.any(String));
        expect(response.body.entryId).toBe(entryId);
        expect(response.body.unsignedParams).toEqual(UNSIGNED_PARAMS);
        expect(response.body.privateParams).toEqual(PRIVATE_PARAMS);
        expect(response.body.publicParamsMode).toBe(true);
        expect(response.body.token).toEqual(expect.any(String));

        embedId = response.body.embedId;
        validToken = response.body.token;

        // The token verifies against the workbook's stored public key and carries the locked params.
        const secret = await EmbeddingSecretModel.query(EmbeddingSecretModel.primary)
            .where({[EmbeddingSecretModelColumn.WorkbookId]: Utils.decodeId(workbookId)})
            .first();

        const decoded = jwt.verify(validToken, secret?.publicKey as string, {
            algorithms: ['RS256'],
        });
        expect(decoded).toMatchObject({embedId, params: SIGNED_PARAMS});

        privateKeyPem = decryptString(secret?.privateKey as string, appConfig.cryptoKey as string);
    });

    test('Creating an embed keeps the object private (entry.public is not set)', async () => {
        const row = await Entry.query(Entry.primary)
            .where({[EntryColumn.EntryId]: Utils.decodeId(entryId)})
            .first();

        expect(row?.public).toBe(false);

        // And the public-read path still refuses it — the chart is reachable only through the token.
        await authPrivateRoute(request(app).get(routes.publicEntries(entryId))).expect(404);
    });

    test('A valid token returns exactly the embed’s object with its locked/open parameter config', async () => {
        const response = await getEmbeddedEntry(validToken).expect(200);

        // Exactly the embed's (private) object.
        expect(response.body.entry.entryId).toBe(entryId);
        expect(response.body.entry.public).toBe(false);
        expect(response.body.embed.embedId).toBe(embedId);

        // Parameter filtering contract: locked params ride in the token (enforced), the open allowlist
        // is what a URL may override, everything else is neither exposed nor overridable.
        expect(response.body.token.params).toEqual(SIGNED_PARAMS);
        expect(response.body.embed.unsignedParams).toEqual(UNSIGNED_PARAMS);
        expect(response.body.embed.privateParams).toEqual(PRIVATE_PARAMS);
        expect(response.body.embed.publicParamsMode).toBe(true);
    });

    test('A forged token (signed with a stranger key) is rejected and no object is returned', async () => {
        const {privateKey: strangerKey} = generateRs256KeyPair();
        const forged = jwt.sign({embedId, params: {locked: 'tampered'}}, strangerKey, {
            algorithm: 'RS256',
        });

        const response = await getEmbeddedEntry(forged).expect(400);
        expect(response.body.entry).toBeUndefined();
    });

    test('A malformed token is rejected and no object is returned', async () => {
        const response = await getEmbeddedEntry('not-a-jwt').expect(400);
        expect(response.body.entry).toBeUndefined();
    });

    test('A well-formed token for an unknown embed fails closed (not found)', async () => {
        const unknown = jwt.sign({embedId: Utils.encodeId('0')}, privateKeyPem, {
            algorithm: 'RS256',
        });

        const response = await getEmbeddedEntry(unknown).expect(404);
        expect(response.body.entry).toBeUndefined();
    });

    test('A request with no token is rejected', async () => {
        await authPrivateRoute(request(app).get(routes.embeddedEntry)).expect(400);
    });
});
