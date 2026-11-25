"""Live two-account check on a real Jira work item: protect, deny, reveal in place, revoke, deny.

Settings come from the environment, so no site or account is written into the repository:
  SHIELD_ISSUE_URL   https://<site>.atlassian.net/browse/<KEY-1>
  SHIELD_PUBLISHER_PROFILE / SHIELD_RECIPIENT_PROFILE   signed-in Chrome profile folders
  SHIELD_RECIPIENT_NAME   the recipient's Jira display name
Sign in once with scripts/open-login-profiles.ps1, and check which folder holds which person.
"""
import json
import os
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CHROME = os.environ.get("CHROME_PATH", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
ISSUE = os.environ["SHIELD_ISSUE_URL"]
PUBLISHER = os.environ.get("SHIELD_PUBLISHER_PROFILE", str(ROOT / "e2e/.auth/shreyash-profile"))
RECIPIENT = os.environ.get("SHIELD_RECIPIENT_PROFILE", str(ROOT / "e2e/.auth/kritika-profile"))
RECIPIENT_NAME = os.environ["SHIELD_RECIPIENT_NAME"]
OUT = ROOT / ".tmp"


def open_panel(p, profile):
    ctx = p.chromium.launch_persistent_context(user_data_dir=profile, executable_path=CHROME, headless=False,
                                               viewport={"width": 1440, "height": 960})
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(ISSUE, wait_until="domcontentloaded", timeout=90000)
    page.get_by_role("button", name=re.compile("View app actions", re.I)).first.click(timeout=30000)
    page.get_by_text("Screenshot Shield", exact=True).first.click()
    frame = page.frame_locator("iframe[src*='atlassian-dev.net']").first
    expect(frame.get_by_role("button", name="Protect a screenshot")).to_be_enabled(timeout=60000)
    return ctx, page, frame


def main():
    OUT.mkdir(exist_ok=True)
    results = {}
    with sync_playwright() as p:
        pub_ctx, pub_page, pub = open_panel(p, PUBLISHER)
        pub.locator("input[type=file]").set_input_files(str(ROOT / "fixtures/payment-failed.png"))
        expect(pub.locator("table.masks .lozenge").first).to_be_visible(timeout=120000)
        results["suggested"] = pub.locator("table.masks .lozenge").all_inner_texts()
        pub.locator(".share select").first.select_option(label=RECIPIENT_NAME)
        pub.get_by_role("button", name="Attach masked screenshot").click()
        # Pin the checks to the screenshot just attached: older ones may already be listed.
        notice = pub.get_by_text(re.compile(r"^Attached protected-"))
        expect(notice).to_be_visible(timeout=90000)
        name = re.search(r"protected-\S+\.png", notice.inner_text()).group(0)
        results["attached"] = name
        shot = pub.locator(".shot", has_text=name)
        expect(shot.locator(".masked")).to_be_visible(timeout=60000)
        expect(shot.get_by_role("button", name="Reveal in place")).to_be_disabled()
        results["publisher_cannot_reveal"] = True
        pub_page.screenshot(path=str(OUT / "publisher.png"))

        rec_ctx, rec_page, rec = open_panel(p, RECIPIENT)
        theirs = rec.locator(".shot", has_text=name)
        theirs.get_by_role("button", name="Reveal in place").click()
        expect(theirs.locator(".revealed")).to_be_visible(timeout=60000)
        results["recipient_reveals_in_place"] = True
        rec_page.wait_for_timeout(1500)  # let the reveal animation finish before the picture is taken
        theirs.locator(".shot-image").screenshot(path=str(OUT / "revealed.png"))
        rec_page.screenshot(path=str(OUT / "recipient.png"))

        shot.get_by_role("button", name="Revoke access").click()
        shot.get_by_role("button", name="Revoke", exact=True).click()
        expect(shot.get_by_text("Access revoked")).to_be_visible(timeout=60000)
        results["publisher_revokes"] = True

        theirs.get_by_role("button", name="Hide").click()
        rec.get_by_role("button", name="Refresh").click()
        expect(theirs.get_by_role("button", name="Reveal in place")).to_be_disabled(timeout=60000)
        results["recipient_denied_after_revoke"] = True
        pub_ctx.close()
        rec_ctx.close()
    (OUT / "full-flow.json").write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
