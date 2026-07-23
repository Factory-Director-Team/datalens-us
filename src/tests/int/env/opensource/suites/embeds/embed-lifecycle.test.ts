import request from 'supertest';

import {DL_EMBED_TOKEN_HEADER} from '../../../../../../const';
import {
    EmbeddingSecretModel,
    EmbeddingSecretModelColumn,
} from '../../../../../../db/models/new/embedding-secret';
import Utils from '../../../../../../utils';
import {routes} from '../../../../routes';
import {app, auth, authPrivateRoute} from '../../auth';
import {createMockWorkbook, createMockWorkbookEntry} from '../../helpers';
import {OpensourceRole} from '../../roles';

// Ticket 06 — Embed lifecycle. A workbook editor can (1) list the Embeds that already exist for an
// object, (2) delete one so its iframe stops rendering everywhere it is pasted, and (3) rotate the
// workbook Embedding secret to invalidate every Embed at once. Deleted or revoked Embeds fail closed for
// the anonymous viewer: a deleted Embed resolves to not-found; a token signed with a rotated-away key no
// longer verifies. List/delete/rotate are all restricted to workbook editors and above.

// Workbook A / chart E1 — list + delete. Rotation is workbook-wide, so it lives in its own workbook B /
// chart E2 to keep the two concerns from disturbing each other's assertions.
let workbookId: string;
let entryId: string;
let embed1Id: string;
let embed1Token: string;
let embed2Id: string;
let embed2Token: string;

let rotateWorkbookId: string;
let rotateEntryId: string;
let rotateEmbedToken: string;
let oldPublicKey: string;
let embeddingSecretId: string;

const getEmbeddedEntry = (token: string) =>
    authPrivateRoute(request(app).get(routes.embeddedEntry)).set(DL_EMBED_TOKEN_HEADER, token);

const listEmbeds = (id: string, role: OpensourceRole) =>
    auth(request(app).get(routes.embeds), {role}).query({entryId: id});

const createEmbed = (id: string) =>
    auth(request(app).post(routes.embeds), {role: OpensourceRole.Editor}).send({entryId: id});

describe('Embed lifecycle: list, delete, rotate secret', () => {
    test('Setup: two workbooks each with a private chart', async () => {
        // Distinct titles — two root workbooks with the same title collide (409).
        const workbook = await createMockWorkbook({title: 'Embed lifecycle listing workbook'});
        workbookId = workbook.workbookId;
        const entry = await createMockWorkbookEntry({workbookId, name: 'Listable chart'});
        entryId = entry.entryId;

        const rotateWorkbook = await createMockWorkbook({title: 'Embed lifecycle rotate workbook'});
        rotateWorkbookId = rotateWorkbook.workbookId;
        const rotateEntry = await createMockWorkbookEntry({
            workbookId: rotateWorkbookId,
            name: 'Rotatable chart',
        });
        rotateEntryId = rotateEntry.entryId;
    });

    // ---- List ------------------------------------------------------------------------------------

    test('A viewer cannot list the embeds for an object', async () => {
        await listEmbeds(entryId, OpensourceRole.Viewer).expect(403);
    });

    test('An object with no embeds lists as empty for an editor', async () => {
        const response = await listEmbeds(entryId, OpensourceRole.Editor).expect(200);
        expect(response.body).toEqual([]);
    });

    test('An editor sees the embeds that exist for the object, newest first', async () => {
        const first = await createEmbed(entryId).expect(200);
        embed1Id = first.body.embedId;
        embed1Token = first.body.token;

        const second = await createEmbed(entryId).expect(200);
        embed2Id = second.body.embedId;
        embed2Token = second.body.token;

        const response = await listEmbeds(entryId, OpensourceRole.Editor).expect(200);

        expect(response.body).toHaveLength(2);
        // Newest first.
        expect(response.body[0].embedId).toBe(embed2Id);
        expect(response.body[1].embedId).toBe(embed1Id);
        // Every listed embed belongs to the object.
        response.body.forEach((embed: {entryId: string; token?: string}) => {
            expect(embed.entryId).toBe(entryId);
            // Listing exposes the record only — never a signed token (issued once at create, ADR 0003).
            expect(embed.token).toBeUndefined();
        });
    });

    // ---- Delete → deny ---------------------------------------------------------------------------

    test('Both embeds resolve for an anonymous viewer before deletion', async () => {
        const one = await getEmbeddedEntry(embed1Token).expect(200);
        expect(one.body.entry.entryId).toBe(entryId);

        const two = await getEmbeddedEntry(embed2Token).expect(200);
        expect(two.body.entry.entryId).toBe(entryId);
    });

    test('A viewer cannot delete an embed', async () => {
        await auth(request(app).delete(routes.embed(embed2Id)), {
            role: OpensourceRole.Viewer,
        }).expect(403);

        // Still resolves — the failed delete changed nothing.
        await getEmbeddedEntry(embed2Token).expect(200);
    });

    test('An editor deletes an embed and its token then fails closed (not-found)', async () => {
        const response = await auth(request(app).delete(routes.embed(embed2Id)), {
            role: OpensourceRole.Editor,
        }).expect(200);
        expect(response.body.embedId).toBe(embed2Id);

        // The deleted embed's token stops resolving everywhere it is pasted (ADR 0003) and no object
        // leaks.
        const denied = await getEmbeddedEntry(embed2Token).expect(404);
        expect(denied.body.entry).toBeUndefined();
    });

    test('Deleting one embed leaves the object’s other embeds intact', async () => {
        // The untouched embed still resolves...
        const still = await getEmbeddedEntry(embed1Token).expect(200);
        expect(still.body.entry.entryId).toBe(entryId);

        // ...and the list now shows only it.
        const response = await listEmbeds(entryId, OpensourceRole.Editor).expect(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].embedId).toBe(embed1Id);
    });

    test('Deleting an already-deleted embed fails closed (not-found)', async () => {
        // embed2 was deleted above; deleting it again resolves to not-found rather than leaking that
        // the id once existed. (A real 13-char encoded id whose row is gone.)
        await auth(request(app).delete(routes.embed(embed2Id)), {
            role: OpensourceRole.Editor,
        }).expect(404);
    });

    // ---- Rotate → deny ---------------------------------------------------------------------------

    test('An embed on the rotate workbook resolves before rotation', async () => {
        const created = await createEmbed(rotateEntryId).expect(200);
        rotateEmbedToken = created.body.token;

        const resolved = await getEmbeddedEntry(rotateEmbedToken).expect(200);
        expect(resolved.body.entry.entryId).toBe(rotateEntryId);

        // Capture the secret's current public key so we can prove rotation replaced it in place.
        const secret = await EmbeddingSecretModel.query(EmbeddingSecretModel.primary)
            .where({[EmbeddingSecretModelColumn.WorkbookId]: Utils.decodeId(rotateWorkbookId)})
            .first();
        oldPublicKey = secret?.publicKey as string;
        embeddingSecretId = Utils.encodeId(secret?.embeddingSecretId as string);
    });

    test('A viewer cannot rotate the embedding secret', async () => {
        await auth(request(app).post(routes.rotateEmbeddingSecret), {role: OpensourceRole.Viewer})
            .send({workbookId: rotateWorkbookId})
            .expect(403);

        // The secret is untouched — the existing token still resolves.
        await getEmbeddedEntry(rotateEmbedToken).expect(200);
    });

    test('An editor rotates the secret in place (new public key, same secret id, no private key leaked)', async () => {
        const response = await auth(request(app).post(routes.rotateEmbeddingSecret), {
            role: OpensourceRole.Editor,
        })
            .send({workbookId: rotateWorkbookId})
            .expect(200);

        // Rotated in place: same secret row, fresh key material.
        expect(response.body.embeddingSecretId).toBe(embeddingSecretId);
        expect(response.body.publicKey).toEqual(expect.any(String));
        expect(response.body.publicKey).not.toBe(oldPublicKey);
        // The private key is never surfaced by any read endpoint (ADR 0003).
        expect(response.body.privateKey).toBeUndefined();
    });

    test('Rotating the secret invalidates the existing embed token (fails closed)', async () => {
        // The token was signed with the old private key; it no longer verifies against the new public
        // key, so it fails closed and no object is returned.
        const denied = await getEmbeddedEntry(rotateEmbedToken).expect(400);
        expect(denied.body.entry).toBeUndefined();
    });

    test('An embed created after rotation resolves against the new key', async () => {
        const created = await createEmbed(rotateEntryId).expect(200);
        const freshToken = created.body.token;

        const resolved = await getEmbeddedEntry(freshToken).expect(200);
        expect(resolved.body.entry.entryId).toBe(rotateEntryId);
    });
});
