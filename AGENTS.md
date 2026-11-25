# Orientation for coding assistants

Screenshot Shield for Jira is a Forge issue panel that masks private details in screenshots in the browser and lets
one named person reveal one value.

Read in this order: `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `src/resolvers/screenshots.js`,
`static/panel/src/App.jsx`.

- The backend in `src/` is CommonJS; the panel in `static/panel/` uses ES modules.
- Check changes with `npm test` and `npm run build:panel`.
- Keep these true: the original image is never uploaded; access is decided on the server; a denial returns no pixels;
  detection leaves error codes and order numbers readable.
- Never commit credentials or signed-in browser profiles (see `.gitignore`).
