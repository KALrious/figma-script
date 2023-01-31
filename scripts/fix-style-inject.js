// Because of a bug in rollup with the rollup option preserveModules: true,
// we added 'style-inject' as external in rollup build and we have to fix rollup imports
const replace = require('replace-in-file');

const options = {
  files: ['dist/**/*.js'],
  from: /from '.*node_modules\/style-inject\/dist\/style-inject\.es\.js';/g,
  to: "from 'style-inject';",
};

console.log('### Fix style-inject ###');
replace(options)
  .then((changedFiles) => {
    const filesChangedCount = changedFiles.filter((f) => f.hasChanged).length;
    console.log(`ReplaceModified ${filesChangedCount} files`);
  })
  .catch((error) => {
    console.error('Error occurred:', error);
  });
