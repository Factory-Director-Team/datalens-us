import jwt from 'jsonwebtoken';
import request from 'supertest';

import {decryptString, generateRs256KeyPair} from '../../../../../../components/crypto';
import {DL_EMBED_TOKEN_HEADER} from '../../../../../../const';
import {EmbedModel, EmbedModelColumn} from '../../../../../../db/models/new/embed';
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

// Ticket 05 — an Embed for a DASHBOARD serves the whole dashboard anonymously: the dashboard resolves by
// the Embed token (like a chart embed, ticket 04), and each dependent chart resolves by the same token
// plus its id (allowAllDeps). The dependency read is bounded to genuine widget dependencies of that exact
// dashboard, so an Embed never becomes a key to the rest of the workbook, and it fails closed for a
// forged, malformed, or deleted token.

let workbookId: string;
let dashId: string;
let depWidgetId: string;
let unlinkedWidgetId: string;
let depDatasetId: string;
let chartEmbedId: string;
let chartEmbedToken: string;
let embedId: string;
let validToken: string;
let privateKeyPem: string;

// The locked/open parameter contract the publisher sets when creating the embed. Locked values ride in
// the signed token (enforced as constants); the open allowlist is what an iframe URL may override.
const UNSIGNED_PARAMS = ['region'];
const PRIVATE_PARAMS = ['secret'];
const SIGNED_PARAMS = {locked: 'lockedValue'};

const getEmbeddedEntry = (token: string) =>
    authPrivateRoute(request(app).get(routes.embeddedEntry)).set(DL_EMBED_TOKEN_HEADER, token);

const getEmbeddedDependency = (entryId: string, token: string) =>
    authPrivateRoute(request(app).get(routes.embeddedDependency(entryId))).set(
        DL_EMBED_TOKEN_HEADER,
        token,
    );

describe('Embed: dashboard', () => {
    test('Setup: a workbook with a dashboard, a dependent chart, a dataset, and an unlinked chart', async () => {
        const workbook = await createMockWorkbook();
        workbookId = workbook.workbookId;

        const depWidget = await createMockWorkbookEntry({
            workbookId,
            name: 'Dependent chart',
            scope: 'widget',
            type: 'widget-type',
        });
        depWidgetId = depWidget.entryId;

        // Another chart in the SAME workbook that the dashboard does NOT depend on — the embed must not
        // unlock it.
        const unlinkedWidget = await createMockWorkbookEntry({
            workbookId,
            name: 'Unlinked chart',
            scope: 'widget',
            type: 'widget-type',
        });
        unlinkedWidgetId = unlinkedWidget.entryId;

        // A dataset the dashboard links to (e.g. a selector's dataset). It is a dependency but NOT a
        // chart, so it must not be served anonymously — only dependent charts are unlocked.
        const depDataset = await createMockWorkbookEntry({
            workbookId,
            name: 'Dashboard dataset',
            scope: 'dataset',
            type: 'dataset-type',
        });
        depDatasetId = depDataset.entryId;

        const dash = await createMockWorkbookEntry({
            workbookId,
            name: 'Embeddable dashboard',
            scope: 'dash',
            type: 'dash-type',
            links: {
                [depWidgetId]: depWidgetId,
                [depDatasetId]: depDatasetId,
            },
        });
        dashId = dash.entryId;
    });

    test('A viewer cannot create a dashboard embed', async () => {
        await auth(request(app).post(routes.embeds), {role: OpensourceRole.Viewer})
            .send({entryId: dashId})
            .expect(403);
    });

    test('An editor creates a dashboard embed (allowAllDeps) and gets a signed token back', async () => {
        const response = await auth(request(app).post(routes.embeds), {role: OpensourceRole.Editor})
            .send({
                entryId: dashId,
                unsignedParams: UNSIGNED_PARAMS,
                privateParams: PRIVATE_PARAMS,
                signedParams: SIGNED_PARAMS,
                publicParamsMode: true,
            })
            .expect(200);

        expect(response.body.embedId).toEqual(expect.any(String));
        expect(response.body.entryId).toBe(dashId);
        expect(response.body.unsignedParams).toEqual(UNSIGNED_PARAMS);
        expect(response.body.privateParams).toEqual(PRIVATE_PARAMS);
        expect(response.body.publicParamsMode).toBe(true);
        expect(response.body.token).toEqual(expect.any(String));

        embedId = response.body.embedId;
        validToken = response.body.token;

        // A dashboard embed serves all its dependent charts by default — the flag is set on the record.
        const embedRow = await EmbedModel.query(EmbedModel.primary)
            .where({[EmbedModelColumn.EmbedId]: Utils.decodeId(embedId)})
            .first();
        expect(embedRow?.allowAllDeps).toBe(true);

        // The token verifies against the workbook's stored public key (DataLens signed it, ADR 0003)
        // and carries the locked params, so they are enforced wherever the token resolves.
        const secret = await EmbeddingSecretModel.query(EmbeddingSecretModel.primary)
            .where({[EmbeddingSecretModelColumn.WorkbookId]: Utils.decodeId(workbookId)})
            .first();

        const decoded = jwt.verify(validToken, secret?.publicKey as string, {
            algorithms: ['RS256'],
        });
        expect(decoded).toMatchObject({embedId, params: SIGNED_PARAMS});

        privateKeyPem = decryptString(secret?.privateKey as string, appConfig.cryptoKey as string);
    });

    test('Creating the embed keeps the dashboard private (entry.public is not set)', async () => {
        const row = await Entry.query(Entry.primary)
            .where({[EntryColumn.EntryId]: Utils.decodeId(dashId)})
            .first();
        expect(row?.public).toBe(false);

        // And the anonymous public-read path still refuses it — the dashboard is reachable only via the
        // token.
        await authPrivateRoute(request(app).get(routes.publicEntries(dashId))).expect(404);
    });

    test('A valid token resolves the dashboard itself with its locked/open parameter config', async () => {
        const response = await getEmbeddedEntry(validToken).expect(200);

        expect(response.body.entry.entryId).toBe(dashId);
        expect(response.body.entry.scope).toBe('dash');
        expect(response.body.entry.public).toBe(false);
        expect(response.body.embed.embedId).toBe(embedId);

        // The locked params ride in the token; the open allowlist is what a URL may override. The BFF
        // enforces this split across the dashboard from exactly these inputs (ticket 04 filterParams).
        expect(response.body.token.params).toEqual(SIGNED_PARAMS);
        expect(response.body.embed.unsignedParams).toEqual(UNSIGNED_PARAMS);
        expect(response.body.embed.privateParams).toEqual(PRIVATE_PARAMS);
        expect(response.body.embed.publicParamsMode).toBe(true);
    });

    test('A valid token and a dependent chart id resolves that chart with the same parameter config', async () => {
        const response = await getEmbeddedDependency(depWidgetId, validToken).expect(200);

        expect(response.body.entry.entryId).toBe(depWidgetId);
        expect(response.body.entry.public).toBe(false);
        expect(response.body.embed.embedId).toBe(embedId);
        expect(response.body.token.embedId).toBe(embedId);

        // A dependent chart is served under the same token, so the same locked/open contract travels to
        // it — the publisher's locked slice is enforced on every chart of the dashboard, not just the
        // dashboard entry (ticket 05 AC: locked params enforced and unsigned honored across the dashboard).
        expect(response.body.token.params).toEqual(SIGNED_PARAMS);
        expect(response.body.embed.unsignedParams).toEqual(UNSIGNED_PARAMS);
        expect(response.body.embed.privateParams).toEqual(PRIVATE_PARAMS);
        expect(response.body.embed.publicParamsMode).toBe(true);
    });

    test("The embed's own dashboard id also resolves through the dependency endpoint", async () => {
        const response = await getEmbeddedDependency(dashId, validToken).expect(200);

        expect(response.body.entry.entryId).toBe(dashId);
        expect(response.body.entry.scope).toBe('dash');
    });

    test('A chart in the same workbook that the dashboard does not depend on fails closed', async () => {
        const response = await getEmbeddedDependency(unlinkedWidgetId, validToken).expect(404);
        expect(response.body.entry).toBeUndefined();
    });

    test('A non-chart dependency (dataset) of the dashboard is not served', async () => {
        const response = await getEmbeddedDependency(depDatasetId, validToken).expect(404);
        expect(response.body.entry).toBeUndefined();
    });

    test('A forged token (signed with a stranger key) is rejected on the dependency read', async () => {
        const {privateKey: strangerKey} = generateRs256KeyPair();
        const forged = jwt.sign({embedId}, strangerKey, {algorithm: 'RS256'});

        const response = await getEmbeddedDependency(depWidgetId, forged).expect(400);
        expect(response.body.entry).toBeUndefined();
    });

    test('A malformed token is rejected on the dependency read', async () => {
        const response = await getEmbeddedDependency(depWidgetId, 'not-a-jwt').expect(400);
        expect(response.body.entry).toBeUndefined();
    });

    test('A chart Embed (allowAllDeps off) cannot resolve dependencies', async () => {
        // An embed for a plain chart never serves other entries by id — even one that is a real
        // dependency of some dashboard. This proves the allowAllDeps gate, not just the links check.
        const chartEmbed = await auth(request(app).post(routes.embeds), {
            role: OpensourceRole.Editor,
        })
            .send({entryId: unlinkedWidgetId})
            .expect(200);
        chartEmbedId = chartEmbed.body.embedId;
        chartEmbedToken = chartEmbed.body.token;

        const chartEmbedRow = await EmbedModel.query(EmbedModel.primary)
            .where({[EmbedModelColumn.EmbedId]: Utils.decodeId(chartEmbedId)})
            .first();
        expect(chartEmbedRow?.allowAllDeps).toBe(false);

        const response = await getEmbeddedDependency(depWidgetId, chartEmbedToken).expect(404);
        expect(response.body.entry).toBeUndefined();
    });

    test('A deleted Embed fails closed for both the dashboard and its dependencies', async () => {
        // A well-formed token whose Embed row no longer exists must stop rendering everywhere (ADR
        // 0003 — revocation is by deleting the Embed). Signed with the real private key so only the
        // missing row, not the signature, is under test.
        const deletedEmbedToken = jwt.sign({embedId}, privateKeyPem, {algorithm: 'RS256'});

        await EmbedModel.query(EmbedModel.primary)
            .delete()
            .where({[EmbedModelColumn.EmbedId]: Utils.decodeId(embedId)});

        await getEmbeddedEntry(deletedEmbedToken).expect(404);
        await getEmbeddedDependency(depWidgetId, deletedEmbedToken).expect(404);
    });
});
