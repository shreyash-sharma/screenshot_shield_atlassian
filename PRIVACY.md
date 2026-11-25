# Privacy policy: Screenshot Shield for Jira

Last updated: 25 November 2026

Screenshot Shield is a Forge app published by an individual developer.

## What stays in your browser

The screenshot you load, and the text recognised in it, are processed in your browser. The original image is not
uploaded by the app.

## What goes to Jira

The masked image is attached to the work item. Anyone who can see the work item can see it.

## What the app stores in Atlassian Forge storage

- The work item, attachment, filename and image size.
- The Atlassian account ID and display name of the person who published, and of the person allowed to reveal.
- The expiry time, whether access was revoked, and when.
- Only if someone was allowed to reveal a value: that one image crop, encrypted with AES-256-GCM, and its key.

A revealed value may itself be personal data, depending on what you choose.

## Why

To show protected screenshots on the work item and to decide who may reveal a value.

## How long

- Revoking deletes the encrypted crop and its key. The record of who published and who was named remains.
- Deleting the attachment in Jira deletes the app's data for it the next time the panel is opened on that work item.
- Expiry stops reveals but does not delete the data.

## Sharing

The app declares no external network access. The developer does not sell or send this data to third parties. Data is
held on Atlassian's platform, under Atlassian's own terms and privacy policy.

## Not yet built

The app does not yet report stored account IDs to Atlassian for erasure when an account is closed.

## Your choices and contact

You can revoke access or delete the attachment at any time. For questions or deletion requests, open an issue at
https://github.com/shreyash-sharma/screenshot_shield_atlassian/issues. Issues are public, so do not include personal
details in them.
