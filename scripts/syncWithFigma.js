/* eslint-disable no-console, no-await-in-loop */
const fs = require('fs-extra');
const fetch = require('node-fetch');
const { paramCase } = require('param-case');
const removeDiacritics = require('diacritics').remove;
const camelCase = require('camelcase');
const { default: svgr } = require('@svgr/core');
const componentTemplate = require('./component-template');

const BASE_URL = 'https://api.figma.com';
// Token Figma d'un compte avec des droits en Guest / Viewer sur le Kit UI (Compte : team.chappaai@gmail.com)
const ACCESS_TOKEN = '44937-fc5e46b7-b1b6-4d43-9a74-9df15202a68a';
const ICONS_FILE_ID = 'JTy0u4USkgndg82hRlJLA9vA';
const TEMP_SVG_DIRECTORY_FOR_FONT = 'dist/fonts/icons/svg';
const FRAME_TITLE_COMPONENT_NAME = 'Title';
const NODE_TYPE = {
  PAGE: 'CANVAS',
  FRAME: 'FRAME',
  COMPONENT: 'COMPONENT',
  INSTANCE: 'INSTANCE',
  VECTOR: 'VECTOR',
};

function getRequestHeaders() {
  const headers = new fetch.Headers();
  headers.append('X-Figma-Token', ACCESS_TOKEN);
  return { headers };
}

function getIconsPage(fileData, figmaIconsPageName) {
  for (let i = 0; i < fileData.document.children.length; i++) {
    const pageData = fileData.document.children[i];
    if (NODE_TYPE.PAGE === pageData.type && figmaIconsPageName === pageData.name) {
      return pageData;
    }
  }
  throw new Error(`Aucune page ${figmaIconsPageName} n'a été trouvée.`);
}

function isFrame(node) {
  return NODE_TYPE.FRAME === node.type;
}

function isIconComponent(node) {
  return NODE_TYPE.COMPONENT === node.type || NODE_TYPE.INSTANCE === node.type;
}

function isIconCompatibleWithFont(node) {
  return node.children.length === 1 && NODE_TYPE.VECTOR === node.children[0].type;
}

function getFrameTitleComponentId(fileData) {
  const componentsEntries = Object.entries(fileData.components);
  for (let i = 0; i < componentsEntries.length; i++) {
    const componentEntry = componentsEntries[i];
    if (componentEntry[1].name === FRAME_TITLE_COMPONENT_NAME) {
      console.info(`>>> Composant de titre de Frame trouvé avec l'id ${componentEntry[0]}.`);
      return componentEntry[0];
    }
  }
  throw new Error(`Aucun composant de titre de Frame n'a été trouvé.`);
}

function registerIconComponentInList(iconComponent, componentPrefix, categoryName, useCategoryInFilename, iconsList) {
  if (isIconComponent(iconComponent)) {
    const directoryName = paramCase(removeDiacritics(categoryName), '-');
    const fileNameStart = useCategoryInFilename ? `${componentPrefix}-${directoryName}` : componentPrefix;
    const fileName = `${fileNameStart}-${paramCase(removeDiacritics(iconComponent.name), '-')}`;
    iconsList.push({
      id: iconComponent.id,
      fileName,
      componentName: camelCase(fileName, { pascalCase: true }),
      directory: directoryName,
      isFontCompatible: isIconCompatibleWithFont(iconComponent),
    });
  }
}

async function getIconList(figmaIconsPageName, componentPrefix, useCategoryInFilename) {
  console.info(`>>> Récupération des infos du fichier source Figma ${ICONS_FILE_ID}.`);
  const iconsList = [];
  let fileData = {};

  try {
    const fileFetched = await fetch(`${BASE_URL}/v1/files/${ICONS_FILE_ID}`, getRequestHeaders());
    fileData = await fileFetched.json();
  } catch (e) {
    throw new Error('Impossible de récupérer le fichier.');
  }

  const frameTitleComponentId = getFrameTitleComponentId(fileData);
  const iconsPage = getIconsPage(fileData, figmaIconsPageName);
  for (let i = 0; i < iconsPage.children.length; i++) {
    const iconsFrame = iconsPage.children[i];
    if (isFrame(iconsFrame)) {
      const categoryName = iconsFrame.name;
      for (let j = 0; j < iconsFrame.children.length; j++) {
        const componentToRegister = iconsFrame.children[j];
        if (frameTitleComponentId !== componentToRegister.componentId) {
          registerIconComponentInList(
            componentToRegister,
            componentPrefix,
            categoryName,
            useCategoryInFilename,
            iconsList
          );
        }
      }
    }
  }

  if (iconsList.length === 0) {
    throw new Error(
      `Aucune icône n'a été trouvée dans le fichier source Figma. Vérifier que chaque icône soit un composant contenu dans une page principale.`
    );
  }

  return iconsList;
}

async function getIconListWithFullData(figmaIconsPageName, componentPrefix, useCategoryInFilename) {
  const iconsListWithFullData = [];

  const iconsList = await getIconList(figmaIconsPageName, componentPrefix, useCategoryInFilename);
  const iconsIdList = iconsList.map((icon) => icon.id);
  let allIconsData = {};

  console.info(`>>> Demande de récupération des URLs de ${iconsIdList.length} icônes depuis Figma.`);
  try {
    const allIconsFileFetched = await fetch(
      `${BASE_URL}/v1/images/${ICONS_FILE_ID}?ids=${iconsIdList.join(',')}&format=svg`,
      getRequestHeaders()
    );
    allIconsData = await allIconsFileFetched.json();
  } catch (e) {
    throw new Error("Les URL des icônes n'ont pas pu être récupérées.");
  }

  const allIconsImages = allIconsData.images || {};
  console.info(`>>> Récupération du contenu de chaque fichier SVG (peut être long).`);
  for (const iconInfo of iconsList) {
    const imageUrl = allIconsImages[iconInfo.id];
    if (!imageUrl) {
      throw new Error(`URL associée à l'image ${iconInfo.id} -> ${iconInfo.componentName} introuvable.`);
    } else {
      let imageContent = '';
      try {
        const imageFetched = await fetch(imageUrl);
        imageContent = await imageFetched.text();
      } catch (e) {
        throw new Error(`Impossible de récupérer le contenu de l'image située à l'URL ${imageUrl}.`);
      }

      iconsListWithFullData.push({
        ...iconInfo,
        content: imageContent,
      });
    }
  }

  return iconsListWithFullData;
}

async function deleteAllIconComponents(componentsDirectory) {
  console.info(`>>> Suppression des composants du répertoire ${componentsDirectory}.`);
  try {
    await fs.remove(componentsDirectory);
  } catch (e) {
    throw new Error('Impossible de supprimer le répertoire.');
  }
}

async function deleteAllSvgUsedForFont() {
  console.info(`>>> Suppression des Svg utilisés pour la fonte du répertoire ${TEMP_SVG_DIRECTORY_FOR_FONT}.`);
  try {
    await fs.remove(TEMP_SVG_DIRECTORY_FOR_FONT);
  } catch (e) {
    throw new Error('Impossible de supprimer le répertoire.');
  }
}

async function referenceIconComponentInIndex(iconData, componentsDirectory) {
  await fs.outputFile(
    `${componentsDirectory}/${iconData.directory}/index.ts`,
    `export {default as ${iconData.componentName}} from './${iconData.fileName}';\n`,
    { flag: 'a' }
  );
  await fs.outputFile(
    `${componentsDirectory}/index.ts`,
    `export {default as ${iconData.componentName}} from './${iconData.directory}/${iconData.fileName}';\n`,
    { flag: 'a' }
  );
}

async function writeIconComponent(iconData, componentsDirectory) {
  const fullPath = `${componentsDirectory}/${iconData.directory}/${iconData.fileName}.tsx`;
  console.info(`>>> Génération du code du composant d'icône ${fullPath}.`);
  console.info(`   >>> Génération via SVGR du code du composant.`);
  let componentCode = '';
  try {
    componentCode = await svgr(
      iconData.content,
      {
        plugins: ['@svgr/plugin-svgo', '@svgr/plugin-jsx', '@svgr/plugin-prettier'],
        dimensions: false,
        svgoConfig: {
          plugins: [
            {
              removeViewBox: false,
            },
            {
              prefixIds: {
                prefix: iconData.fileName,
              },
            },
          ],
        },
        replaceAttrValues: { '#000': 'currentColor' },
        svgProps: { focusable: 'false', 'aria-hidden': 'true' },
        template: componentTemplate,
        typescript: true,
      },
      { componentName: iconData.componentName }
    );
  } catch (e) {
    throw new Error('Génération impossible du code du composant.');
  }

  console.info(`   >>> Ecriture du code du composant.`);
  try {
    await fs.outputFile(fullPath, componentCode);
    await referenceIconComponentInIndex(iconData, componentsDirectory);
  } catch (e) {
    throw new Error('Ecriture impossible du composant.');
  }
}

// Code uniquement utilisé pour la génération de la fonte d'icônes
async function writeIconSvg(iconData) {
  const fullPath = `${TEMP_SVG_DIRECTORY_FOR_FONT}/${iconData.fileName}.svg`;
  console.info(`>>> Génération du fichier SVG ${fullPath} exploitable pour la fonte d'icônes.`);
  try {
    await fs.ensureDir(`${TEMP_SVG_DIRECTORY_FOR_FONT}`);
    await fs.outputFile(fullPath, iconData.content);
  } catch (e) {
    throw new Error('Impossible de créer le fichier SVG.');
  }
}

async function buildAllIconComponents(
  figmaIconsPageName,
  componentsDirectory,
  componentPrefix,
  useCategoryInFilename = false,
  buildFilesRequiredForFontIcons = false
) {
  await deleteAllIconComponents(componentsDirectory);
  if (buildFilesRequiredForFontIcons === true) {
    await deleteAllSvgUsedForFont();
  }
  try {
    const iconListWithFullData = await getIconListWithFullData(
      figmaIconsPageName,
      componentPrefix,
      useCategoryInFilename
    );
    for (const iconData of iconListWithFullData) {
      await writeIconComponent(iconData, componentsDirectory);
      if (buildFilesRequiredForFontIcons === true && iconData.isFontCompatible) {
        await writeIconSvg(iconData);
      }
    }
    console.info(`>>> Génération complète de ${iconListWithFullData.length} composants.`);
  } catch (e) {
    console.error(`Erreur lors de la procédure de génération : ${e.message}`);
    await deleteAllIconComponents(componentsDirectory);
    if (buildFilesRequiredForFontIcons === true) {
      await deleteAllSvgUsedForFont();
    }
  }
}

module.exports.buildAllIconComponents = buildAllIconComponents;
