# Architecture

## Components

```mermaid
flowchart TB
    subgraph Panel["Custom UI panel (static/panel), an iframe on the work item"]
        App[App.jsx] --> Paddle[ocr/paddle.js]
        App --> Detect[masks/detect.js]
        App --> Editor[masks/Editor.jsx]
        App --> Mask[export/maskPng.js]
        App --> Pub[Published.jsx]
        App --> Api[api/jira.js]
        Pub --> Api
    end
    subgraph Fn["Forge function (src), Node 22"]
        Index[index.js] --> Res[resolvers/screenshots.js]
        Res --> Grants[access/grants.js]
        Res --> Aes[crypto/aes.js]
        Res --> Keys[storage/keys.js]
    end
    Api -->|invoke| Index
    Api -->|"requestJira: upload and read attachments"| Jira[("Jira REST API")]
    Res -->|"api.asUser"| Jira
    Res --> KVS[("Forge KVS and secret storage")]
```

The manifest declares no external network access. OCR models and the WebAssembly runtime are bundled with the panel.

## Publish

```mermaid
sequenceDiagram
    actor P as Publisher
    participant UI as Panel (browser)
    participant J as Jira
    participant F as Forge resolver
    participant S as Forge storage
    P->>UI: Upload, drop or paste a screenshot
    UI->>UI: OCR, then suggest masks
    P->>UI: Review masks, pick one value and one person
    UI->>UI: Cut the crop, check it is under 100 kB
    UI->>J: Attach the masked PNG
    J-->>UI: attachmentId
    UI->>F: publishScreenshot(ids, size, bounds, crop, recipient, hours)
    F->>J: Can this user see the work item, and is this their attachment?
    opt a person was named
        F->>F: Generate a key and encrypt the crop
        F->>S: Ciphertext, key (secret storage), grant
    end
    F->>S: Screenshot record (written last) and issue index
    F-->>UI: Public view, with no crop and no key
```

The image is attached before the app records it. If recording fails, the masked attachment stays on the work item
and the panel says so.

## Reveal

```mermaid
sequenceDiagram
    actor N as Named person
    participant UI as Panel
    participant F as Forge resolver
    participant J as Jira
    participant S as Forge storage
    N->>UI: Reveal in place
    UI->>F: revealScreenshot(screenshotId)
    F->>J: Who is this, and can they see the work item?
    F->>S: Screenshot record and grant
    F->>F: evaluateRevealAccess()
    alt denied
        F-->>UI: Reason only
    else allowed
        F->>S: Key and ciphertext
        F->>F: Decrypt
        F-->>UI: Crop PNG and its position
        UI->>UI: Draw the crop over the masked image
    end
```

## Access decision

`evaluateRevealAccess` in [grants.js](../src/access/grants.js) is a pure function. The checks run in this order and
the first failure wins.

```mermaid
flowchart TD
    A{Can see the work item?} -->|no| X1[no_issue_access]
    A -->|yes| B{Record active?}
    B -->|no| X2[not_active]
    B -->|yes| C{Grant exists?}
    C -->|no| X3[no_grant]
    C -->|yes| D{Revoked?}
    D -->|yes| X4[revoked]
    D -->|no| E{Is the named person?}
    E -->|no| X5[not_recipient]
    E -->|yes| F{Grant matches record?}
    F -->|no| X6[grant_mismatch]
    F -->|yes| G{Expired?}
    G -->|yes| X7[expired]
    G -->|no| OK[allowed]
```

## Life of a published screenshot

```mermaid
stateDiagram-v2
    [*] --> MaskedOnly: published with nobody named
    [*] --> Active: published with a named person
    Active --> Expired: time passes
    Active --> Revoked: publisher revokes
    Expired --> Revoked: publisher revokes
    MaskedOnly --> Purged: attachment deleted in Jira
    Active --> Purged: attachment deleted in Jira
    Expired --> Purged: attachment deleted in Jira
    Revoked --> Purged: attachment deleted in Jira
```

Revoking deletes the key and ciphertext. Purging happens when the panel next lists the work item's screenshots; if
Jira's attachment list cannot be read, nothing is purged.

## Stored data

| Key | Store | Contents |
| --- | --- | --- |
| `shot:<id>` | KVS | Issue id and key, attachment id, filename, image size, publisher, revealable bounds, status, time |
| `grant:<id>` | KVS | Recipient, issuer, expiry, revoked flag |
| `crop:<id>` | KVS | AES-256-GCM ciphertext of the crop, with IV and auth tag |
| `key:<id>` | Secret storage | The 256-bit key for that one crop |
| `issue:<ref>:shots` | KVS | Up to 50 screenshot ids, indexed by both issue id and issue key |

## Resolver API

| Function | Input | Returns | Server checks |
| --- | --- | --- | --- |
| `listScreenshots` | `issueId`, `issueKey` | Items with `canReveal`, `canRevoke`, grant summary | Can see the work item |
| `listAssignable` | `issueKey`, `query` | Account ids and display names | Jira's assignable-user search, run as the user |
| `publishScreenshot` | Ids, size, optional bounds, crop, recipient, hours | The new item | Can see the work item; own attachment; PNG crop under 100 kB; at most 720 hours |
| `revealScreenshot` | `screenshotId` | Crop and bounds, or a reason | `evaluateRevealAccess` |
| `revokeGrant` | `screenshotId` | The updated item | Caller is the publisher |

## Mask suggestions

[detect.js](../static/panel/src/masks/detect.js) works on OCR lines (text plus a box).

```mermaid
flowchart LR
    L[OCR lines] --> A[Labelled request IDs] --> B[Shaped IDs] --> C[Secret keys] --> D[Emails]
    D --> E["Cards (Luhn)"] --> F[Phones] --> G[Sorted suggestions]
```

Earlier rules win: a suggestion that overlaps one already made is dropped, so a numeric ID is not mistaken for a
phone or card. Where only part of a line is private, the box is estimated from character positions and widened
slightly, which is one reason a person reviews it. The rules are deliberately narrow: a screenshot exists to show an
error, so masking too much is also a failure.

## Build

`npm run build:panel` copies the onnxruntime WebAssembly files into `static/panel/public/ort`, then Vite builds into
`static/panel/dist`, which the manifest serves. The content security policy allows `unsafe-eval` and `blob:` scripts
for the OCR runtime, and inline styles.

## Tests

| File | Covers |
| --- | --- |
| `tests/grants.test.mjs` | Reveal and revoke decisions |
| `tests/aes.test.mjs` | Round trip; a wrong key fails |
| `tests/detect.test.mjs` | What is suggested and what stays readable |
| `tests/resolvers.test.mjs` | Publish, reveal, revoke and clean-up against stand-in Jira and storage |
| `e2e/full_flow.py` | Two real accounts: protect, deny, reveal, revoke, deny (needs your own site) |
