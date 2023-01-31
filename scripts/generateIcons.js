const syncWithFigma = require('./syncWithFigma');

const ICONS_PAGE_NAME = '05 - Icons';
const ICONS_COMPONENTS_DIRECTORY = 'src/components/icons/generated';
const ICON_COMPONENT_PREFIX = 'oui-icon';

syncWithFigma.buildAllIconComponents(ICONS_PAGE_NAME, ICONS_COMPONENTS_DIRECTORY, ICON_COMPONENT_PREFIX, false, true);
