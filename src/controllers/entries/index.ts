import {checkEntriesExistenceController} from './check-entries-existence';
import {copyEntriesToWorkbookController} from './copy-entries-to-workbook';
import {copyEntryToWorkbookController} from './copy-entry-to-workbook';
import {createEntryController} from './create-entry';
import {deleteEntryController} from './delete-entry';
import {getEntriesController, getEntriesV2Controller} from './get-entries';
import {getEntriesAnnotationController} from './get-entries-annotation';
import {getEntriesDataController} from './get-entries-data';
import {getEntriesMetaController} from './get-entries-meta';
import {getEntriesRelationsController} from './get-entries-relations';
import {getEntryController} from './get-entry';
import {getEntryAccessDescriptionController} from './get-entry-access-description';
import {getEntryMetaController} from './get-entry-meta';
import {getPublicEntryController} from './get-public-entry';
import {getRelationsController} from './get-relations';
import {getRevisionsController} from './get-revisions';
import {renameEntryController} from './rename-entry';
import {switchPublicationStatusController} from './switch-publication-status';
import {switchRevisionEntryController} from './switch-revision-entry';
import {updateEntryController} from './update-entry';
import {updateEntryUnversionedDataPrivateController} from './update-entry-unversioned-data-private';

export default {
    checkEntriesExistenceController,
    getEntriesDataController,
    getEntriesMetaController,
    getEntriesAnnotationController,
    deleteEntryController,
    copyEntryToWorkbookController,
    copyEntriesToWorkbookController,
    renameEntryController,
    updateEntryController,
    updateEntryUnversionedDataPrivateController,
    createEntryController,
    getEntriesController,
    getEntriesV2Controller,
    getEntryController,
    getEntriesRelationsController,
    switchRevisionEntryController,
    getRevisionsController,
    getRelationsController,
    getEntryMetaController,
    getEntryAccessDescriptionController,
    getPublicEntryController,
    switchPublicationStatusController,
};
