// Forge function entry: the only calls the panel can make to the backend.
const Resolver = require('@forge/resolver').default;
const {
  listScreenshots,
  listAssignable,
  publishScreenshot,
  revealScreenshot,
  revokeGrant,
} = require('./resolvers/screenshots');

const resolver = new Resolver();

resolver.define('listScreenshots', listScreenshots);
resolver.define('listAssignable', listAssignable);
resolver.define('publishScreenshot', publishScreenshot);
resolver.define('revealScreenshot', revealScreenshot);
resolver.define('revokeGrant', revokeGrant);

exports.handler = resolver.getDefinitions();
