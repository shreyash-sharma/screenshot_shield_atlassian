# Judge setup

**Everyone sees the error. Only the person you choose can reveal the private detail.**

## Install

1. Open the app's installation link: **(added when the app is shared)**.
2. Install on a Jira Cloud site where you are a site admin. Use Chrome or Edge.
3. You need two users who can both **edit** the same work item (Jira requires edit permission for panel buttons).

## Two-minute run

In this guide Shreyash publishes and Kritika is the person allowed to reveal.

1. Open a work item, then **View app actions**, then **Screenshot Shield**.
2. As Shreyash: **Protect a screenshot** and choose `fixtures/payment-failed.png` (made-up data).
3. Check the suggested masks. Open **What Jira will store**.
4. Under **Who can reveal the request id**, choose Kritika. Click **Attach masked screenshot**.
5. Open the attachment in Jira: the error is readable, the private values are masked.
6. As Shreyash, **Reveal in place** is unavailable: only the named person can use it.
7. As Kritika, open the same panel and click **Reveal in place**: the request ID appears where it was.
8. As Shreyash, **Revoke access** and confirm. Kritika can no longer reveal it; the attachment stays.
