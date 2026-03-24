// =============================================================================
// published.js — Post-publish success page
// =============================================================================

if (!requireAuth()) throw new Error("Not authenticated");

const username = getUsername();
initNavbar();

// =============================================================================
// Read params
// =============================================================================

const params = new URLSearchParams(window.location.search);
const repo = params.get("repo");
const updated = params.get("updated") === "1";

if (!repo) {
  window.location.href = "dashboard.html";
  throw new Error("No repo specified");
}

// =============================================================================
// Set up the page
// =============================================================================

const siteUrl = `https://${username}.github.io/${repo}/`;
const repoFullName = `${username}/${repo}`;

if (updated) {
  $("done-heading").textContent = "Your site has been updated";
  document.querySelector("#site-status-live .site-status-hint").textContent =
    "Be patient — it may take a few minutes for your updates to appear.";
}

$("site-url").href = siteUrl;
$("site-url").textContent = siteUrl;

// =============================================================================
// Poll for site to go live
// =============================================================================

pollForSite(siteUrl);

async function pollForSite(url) {
  const timeout = 120000;
  const interval = 4000;
  const startTime = Date.now();

  $("site-status-checking").hidden = false;
  $("site-status-live").hidden = true;
  $("site-status-slow").hidden = true;

  await new Promise((resolve) => setTimeout(resolve, interval));

  while (Date.now() - startTime < timeout) {
    try {
      const res = await fetch(
        `${CONFIG.workerUrl}/check-site?url=${encodeURIComponent(url)}`,
      );
      const data = await res.json();
      if (data.status >= 200 && data.status < 400) {
        $("site-status-checking").hidden = true;
        $("site-status-live").hidden = false;
        return;
      }
    } catch {
      // Worker unavailable, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  $("site-status-checking").hidden = true;
  $("site-status-slow").hidden = false;
}

// =============================================================================
// Actions
// =============================================================================

$("btn-copy-url").addEventListener("click", async () => {
  const url = $("site-url").href;
  try {
    await navigator.clipboard.writeText(url);
    $("btn-copy-url").textContent = "Copied!";
    setTimeout(() => ($("btn-copy-url").textContent = "Copy link"), 2000);
  } catch {
    const input = document.createElement("input");
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    $("btn-copy-url").textContent = "Copied!";
    setTimeout(() => ($("btn-copy-url").textContent = "Copy link"), 2000);
  }
});

$("btn-update-site").href = `new.html?repo=${encodeURIComponent(repo)}`;

$("btn-new-site").addEventListener("click", () => {
  window.location.href = "new.html";
});
