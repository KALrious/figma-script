const syncWithFigma = require('./syncWithFigma');

const ICONS_PAGE_NAME = '07 - Emojis';
const ICONS_COMPONENTS_DIRECTORY = 'src/components/emoji/generated';
const ICON_COMPONENT_PREFIX = 'oui-emoji';

syncWithFigma.buildAllIconComponents(ICONS_PAGE_NAME, ICONS_COMPONENTS_DIRECTORY, ICON_COMPONENT_PREFIX, true, false);
