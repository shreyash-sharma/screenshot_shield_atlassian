# Opens two isolated Chrome profiles (Shreyash = publisher, Kritika = engineer) so each
# can be signed in to Jira once. Playwright reuses these profiles for the live
# two-account tests. Profiles live in e2e/.auth (gitignored).
param([string]$Site = "https://id.atlassian.com/login")

$root = Split-Path -Parent $PSScriptRoot
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
foreach ($name in "shreyash", "kritika") {
    $dir = Join-Path $root "e2e\.auth\$name-profile"
    New-Item -ItemType Directory -Force $dir | Out-Null
    Start-Process $chrome -ArgumentList "--user-data-dir=`"$dir`"", "--no-first-run", "--new-window", $Site
}
Write-Host "Sign in as SHREYASH in the first window and KRITIKA in the second, open the Jira site, then close both windows."
