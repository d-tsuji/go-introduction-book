var ghpages = require('gh-pages');

/**
 * Place content in the static/project subdirectory of the target
 * branch.
 */
ghpages.publish('_build', {
    dotfiles: true,
    message: 'auto rebuilding site'
  }, {});
