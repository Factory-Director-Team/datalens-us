import request from 'supertest';

import {routes} from '../../../../routes';
import {app, auth, authPrivateRoute} from '../../auth';
import {createMockWorkbook, createMockWorkbookEntry} from '../../helpers';
import {OpensourceRole} from '../../roles';

let entryId: string;

const publicationRoute = (id: string) => `${routes.entries}/${id}/publication`;

test('Setup', async () => {
    const {workbookId} = await createMockWorkbook();
    const entry = await createMockWorkbookEntry({workbookId, name: 'Chart to publish'});
    entryId = entry.entryId;
});

describe('Switch entry publication status', () => {
    test('A viewer cannot publish', async () => {
        await auth(request(app).post(publicationRoute(entryId)), {role: OpensourceRole.Viewer})
            .send({publish: true})
            .expect(403);
    });

    test('An editor publishes the entry, and it becomes readable on the public endpoint', async () => {
        const response = await auth(request(app).post(publicationRoute(entryId)), {
            role: OpensourceRole.Editor,
        })
            .send({publish: true})
            .expect(200);

        expect(response.body.public).toBe(true);

        await authPrivateRoute(request(app).get(routes.publicEntries(entryId))).expect(200);
    });

    test('An editor unpublishes the entry, and the public endpoint fails closed', async () => {
        const response = await auth(request(app).post(publicationRoute(entryId)), {
            role: OpensourceRole.Editor,
        })
            .send({publish: false})
            .expect(200);

        expect(response.body.public).toBe(false);

        await authPrivateRoute(request(app).get(routes.publicEntries(entryId))).expect(404);
    });
});
