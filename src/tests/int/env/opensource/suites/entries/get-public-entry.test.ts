import request from 'supertest';

import {Entry, EntryColumn} from '../../../../../../db/models/new/entry';
import Utils from '../../../../../../utils';
import {routes} from '../../../../routes';
import {app, authPrivateRoute} from '../../auth';
import {createMockWorkbook, createMockWorkbookEntry} from '../../helpers';

let publicEntryId: string;
let privateEntryId: string;

test('Setup', async () => {
    const {workbookId} = await createMockWorkbook();

    const publicEntry = await createMockWorkbookEntry({workbookId, name: 'Public chart'});
    publicEntryId = publicEntry.entryId;

    const privateEntry = await createMockWorkbookEntry({workbookId, name: 'Private chart'});
    privateEntryId = privateEntry.entryId;

    // Publication toggle lands in a later increment; here we flip `public` directly so the
    // public-read endpoint can be tested in isolation.
    await Entry.query(Entry.primary)
        .patch({[EntryColumn.Public]: true})
        .where({[EntryColumn.EntryId]: Utils.decodeId(publicEntryId)});
});

describe('Get public entry', () => {
    test('Returns an entry that is flagged public', async () => {
        const response = await authPrivateRoute(
            request(app).get(routes.publicEntries(publicEntryId)),
        ).expect(200);

        expect(response.body.entryId).toBe(publicEntryId);
    });

    test('Does not return an entry that is not public (fails closed)', async () => {
        await authPrivateRoute(
            request(app).get(routes.publicEntries(privateEntryId)),
        ).expect(404);
    });
});
