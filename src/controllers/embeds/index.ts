import {createEmbedController} from './create-embed';
import {deleteEmbedController} from './delete-embed';
import {getEmbeddedDependencyController} from './get-embedded-dependency';
import {getEmbeddedEntryController} from './get-embedded-entry';
import {listEmbedsController} from './list-embeds';

export default {
    createEmbedController,
    listEmbedsController,
    deleteEmbedController,
    getEmbeddedEntryController,
    getEmbeddedDependencyController,
};
