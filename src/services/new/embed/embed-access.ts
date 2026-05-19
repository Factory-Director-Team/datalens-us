import {AppError} from '@gravity-ui/nodekit';

import type {JoinedEmbedEmbeddingSecretColumns} from '../../../db/presentations/joined-embed-embedding-secret';

const INCORRECT_ENTRY = 'INCORRECT_ENTRY_ID_FOR_EMBED';
const INCORRECT_DEPS = 'INCORRECT_DEPS_IDS_FOR_EMBED';

export function assertRequestedEntryMatchesEmbed(
    embedRow: Pick<
        JoinedEmbedEmbeddingSecretColumns,
        'entryId' | 'depsIds' | 'allowAllDeps'
    >,
    requestedEntryId: string,
) {
    const main = String(embedRow.entryId);
    const req = String(requestedEntryId);

    if (main === req) {
        return;
    }

    if (embedRow.allowAllDeps) {
        return;
    }

    const deps = (embedRow.depsIds || []).map(String);
    if (deps.includes(req)) {
        return;
    }

    throw new AppError(INCORRECT_DEPS, {
        code: INCORRECT_DEPS,
    });
}

export async function assertEntryWorkbookMatchesEmbed(
    args: {
        entryWorkbookId: string | null | undefined;
        embedWorkbookId: string;
    },
) {
    const ew = args.entryWorkbookId ? String(args.entryWorkbookId) : null;
    const mw = String(args.embedWorkbookId);

    if (!ew || ew !== mw) {
        throw new AppError(INCORRECT_ENTRY, {
            code: INCORRECT_ENTRY,
        });
    }
}
