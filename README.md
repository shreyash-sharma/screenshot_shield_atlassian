# Screenshot Shield for Jira

**Everyone sees the error. Only the person you choose can reveal the private detail.**

A Forge Custom UI panel for Jira work items, built for Codegeist 2026 (Apps for Business Teams).

## What it does

1. Upload, drop or paste a screenshot in the panel.
2. Text recognition runs **in your browser** and suggests masks for phone numbers, email addresses, card numbers,
   secret keys and labelled request or trace IDs. Error codes and order numbers are left readable.
3. Review: move, resize, remove or draw masks, and compare with exactly what Jira will store.
4. Optionally let one named person reveal one masked value, for 1 to 30 days.
5. A masked PNG is attached to the work item. Anyone with normal access can open it.
6. The named person reveals the value **in place**, on their screen only. The publisher can revoke.

## How access is enforced

- Jira receives only the masked image. The original is never uploaded.
- Only the revealable crop is sent to the Forge function, encrypted with AES-256-GCM; the key is kept in Forge
  secret storage. The other masked values are discarded.
- Every reveal re-checks work item access, the named account, revocation and expiry on the server.
- Deleting the attachment in Jira deletes the app's key, crop and grant the next time the panel is opened.
- Revoking deletes the key and the encrypted crop. It cannot take back what someone already saw or saved.
- Suggestions are a review aid. They cannot prove an image holds nothing sensitive.

## Develop

```powershell
npm run setup
npm test
npm run build:panel
```

Preview the panel without Jira (a local stand-in for the Forge bridge, never deployed):

```powershell
npm --prefix static/panel run dev -- --mode mock
```

then open `http://localhost:5173/?as=shreyash`, and `?as=kritika` for the second person.

You need Node 22 and the Forge CLI. To use your own Forge app, run `forge register` once, then `npm run deploy`
(development) or `npm run deploy:prod` (production), followed by `forge install`. `npm run fixtures` re-renders the made-up sample screenshot.

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
