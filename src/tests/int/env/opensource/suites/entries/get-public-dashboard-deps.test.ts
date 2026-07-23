import request from 'supertest';

import {Entry, EntryColumn} from '../../../../../../db/models/new/entry';
import Utils from '../../../../../../utils';
import {routes} from '../../../../routes';
import {app, authPrivateRoute} from '../../auth';
import {createMockWorkbook, createMockWorkbookEntry} from '../../helpers';

// Ticket 03 — a public dashboard's dependent charts are authorized anonymously via the links graph
// (option b): a chart is served on the public-read path if it is a dependency (links.toId) of a
// dashboard that is itself public, addressed with ?publicDashId=<dashId>. It fails closed otherwise.

let publicDashId: string;
let depWidgetId: string;
let depDatasetId: string;
let unlinkedWidgetId: string;
let privateDashId: string;
let privateDashDepId: string;
let publicChartId: string;
let publicChartDepId: string;

test('[Setup] public dashboard + dependent chart, and a private dashboard + its chart', async () => {
    const {workbookId} = await createMockWorkbook();

    const depWidget = await createMockWorkbookEntry({
        workbookId,
        name: 'Dependent chart',
        scope: 'widget',
        type: 'widget-type',
    });
    depWidgetId = depWidget.entryId;

    const unlinkedWidget = await createMockWorkbookEntry({
        workbookId,
        name: 'Unlinked private chart',
        scope: 'widget',
        type: 'widget-type',
    });
    unlinkedWidgetId = unlinkedWidget.entryId;

    // A dataset the dashboard links to directly (e.g. a selector bound to a dataset). It must NOT be
    // exposed anonymously: only dependent charts are unlocked, not datasets/connections.
    const depDataset = await createMockWorkbookEntry({
        workbookId,
        name: 'Dashboard dataset',
        scope: 'dataset',
        type: 'dataset-type',
    });
    depDatasetId = depDataset.entryId;

    const publicDash = await createMockWorkbookEntry({
        workbookId,
        name: 'Public dashboard',
        scope: 'dash',
        type: 'dash-type',
        links: {
            [depWidgetId]: depWidgetId,
            [depDatasetId]: depDatasetId,
        },
    });
    publicDashId = publicDash.entryId;

    // Publish ONLY the dashboard (flip public directly, as the sibling public-entry test does). The
    // dependent chart stays private — it must be reachable only via the public-dashboard context.
    await Entry.query(Entry.primary)
        .patch({[EntryColumn.Public]: true})
        .where({[EntryColumn.EntryId]: Utils.decodeId(publicDashId)});

    // A dashboard that is NOT published, with its own dependent chart, to prove the dash must be public.
    const privateDashDep = await createMockWorkbookEntry({
        workbookId,
        name: 'Chart of a private dashboard',
        scope: 'widget',
        type: 'widget-type',
    });
    privateDashDepId = privateDashDep.entryId;

    const privateDash = await createMockWorkbookEntry({
        workbookId,
        name: 'Private dashboard',
        scope: 'dash',
        type: 'dash-type',
        links: {
            [privateDashDepId]: privateDashDepId,
        },
    });
    privateDashId = privateDash.entryId;

    // A PUBLIC chart (not a dashboard) that links to another entry, to prove only dashboards unlock
    // their dependencies — a public chart must not expose the entries it references (e.g. its dataset).
    const publicChartDep = await createMockWorkbookEntry({
        workbookId,
        name: 'Entry linked from a public chart',
        scope: 'widget',
        type: 'widget-type',
    });
    publicChartDepId = publicChartDep.entryId;

    const publicChart = await createMockWorkbookEntry({
        workbookId,
        name: 'Public chart',
        scope: 'widget',
        type: 'widget-type',
        links: {
            [publicChartDepId]: publicChartDepId,
        },
    });
    publicChartId = publicChart.entryId;

    await Entry.query(Entry.primary)
        .patch({[EntryColumn.Public]: true})
        .where({[EntryColumn.EntryId]: Utils.decodeId(publicChartId)});
});

describe('Get public dashboard dependencies', () => {
    test('Returns the public dashboard itself', async () => {
        const response = await authPrivateRoute(
            request(app).get(routes.publicEntries(publicDashId)),
        ).expect(200);

        expect(response.body.entryId).toBe(publicDashId);
    });

    test('Returns a dependent chart when the public dashboard id is supplied', async () => {
        const response = await authPrivateRoute(
            request(app).get(routes.publicEntries(depWidgetId)).query({publicDashId: publicDashId}),
        ).expect(200);

        expect(response.body.entryId).toBe(depWidgetId);
    });

    test('Does not return a dependent chart without the public dashboard context (fails closed)', async () => {
        await authPrivateRoute(request(app).get(routes.publicEntries(depWidgetId))).expect(404);
    });

    test('Does not return a chart that is not a dependency of the public dashboard (fails closed)', async () => {
        await authPrivateRoute(
            request(app)
                .get(routes.publicEntries(unlinkedWidgetId))
                .query({publicDashId: publicDashId}),
        ).expect(404);
    });

    test('Does not return a dependency of a non-public dashboard (fails closed)', async () => {
        await authPrivateRoute(
            request(app)
                .get(routes.publicEntries(privateDashDepId))
                .query({publicDashId: privateDashId}),
        ).expect(404);
    });

    test('Does not let a public chart (non-dashboard) unlock the entries it links to (fails closed)', async () => {
        await authPrivateRoute(
            request(app)
                .get(routes.publicEntries(publicChartDepId))
                .query({publicDashId: publicChartId}),
        ).expect(404);
    });

    test('Does not expose a non-chart dependency (dataset) of the public dashboard (fails closed)', async () => {
        await authPrivateRoute(
            request(app).get(routes.publicEntries(depDatasetId)).query({publicDashId: publicDashId}),
        ).expect(404);
    });
});
