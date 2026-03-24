// =============================================================================
// new.js — Create or update a site
// =============================================================================

if (!requireAuth()) throw new Error("Not authenticated");

const username = getUsername();
$("nav-username").textContent = username;
$("btn-signout").addEventListener("click", signOut);

// =============================================================================
// State
// =============================================================================

let selectedFiles = [];
const params = new URLSearchParams(window.location.search);
const updateRepo = params.get("update");
const isUpdateMode = !!updateRepo;

// =============================================================================
// Update mode setup
// =============================================================================

if (isUpdateMode) {
  $("files-heading").textContent = 'Updating "${updateRepo}"';
  $("publishing-heading").textContent = "Updating your site...";
  $("done-heading").textContent = "Your site has been updated!";
}

// =============================================================================
// Steps
// =============================================================================

const steps = {
  files: $("step-files"),
  name: $("step-name"),
  publishing: $("step-publishing"),
  done: $("step-done"),
  error: $("step-error"),
};

function showStep(stepName) {
  Object.values(steps).forEach((s) => s.classList.remove("active"));
  steps[stepName].classList.add("active");
}

// =============================================================================
// File picker (shared logic from shared.js)
// =============================================================================

const picker = initFilePicker({
  onFilesReady(files) {
    // No special action needed here — Next buttons handle it
  },
});

// =============================================================================
// File selection → Next
// =============================================================================

$("btn-files-next").addEventListener("click", () => {
  const files = picker.getFiles();
  if (!files || files.length === 0) return;
  selectedFiles = files;
  if (isUpdateMode) {
    publish();
  } else {
    showStep("name");
    $("site-name").focus();
    updateUrlPreview();
  }
});

// =============================================================================
// Paste HTML → Next
// =============================================================================

$("btn-paste-next").addEventListener("click", () => {
  const files = picker.getPastedFiles();
  if (!files) return;
  selectedFiles = files;
  if (isUpdateMode) {
    publish();
  } else {
    showStep("name");
    $("site-name").focus();
    updateUrlPreview();
  }
});

// =============================================================================
// Pending files from landing page (via IndexedDB)
// =============================================================================

async function checkPendingFiles() {
  if (isUpdateMode) return;
  const pending = await loadPendingFiles();
  if (pending && pending.length > 0) {
    selectedFiles = pending;
    picker.setFiles(pending);
    showStep("name");
    $("site-name").focus();
    updateUrlPreview();
  }
}

checkPendingFiles();

// =============================================================================
// Site Naming
// =============================================================================

$("site-name").addEventListener("input", updateUrlPreview);

function updateUrlPreview() {
  const name = sanitizeName($("site-name").value);
  const displayName = name || "my-awesome-site";
  $("url-preview-text").textContent =
    `https://${username}.github.io/${displayName}`;
}

// =============================================================================
// Publishing
// =============================================================================

$("btn-publish").addEventListener("click", () => {
  const rawName = $("site-name").value.trim();
  const repoName = sanitizeName(rawName);

  if (!repoName) {
    $("name-error").textContent = "Please enter a name for your site.";
    $("name-error").hidden = false;
    return;
  }
  $("name-error").hidden = true;

  publish(repoName);
});

async function publish(repoName) {
  if (isUpdateMode) {
    await publishUpdate();
  } else {
    await publishCreate(repoName);
  }
}

async function publishCreate(repoName) {
  showStep("publishing");
  setProgress("ps-repo", "active");

  try {
    const repo = await githubApi("/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name: repoName,
        description: "Website published with weejur",
        auto_init: false,
        private: false,
      }),
    });

    await githubApi(`/repos/${repo.full_name}/topics`, {
      method: "PUT",
      body: JSON.stringify({ names: ["weejur"] }),
    });
    setProgress("ps-repo", "done");

    setProgress("ps-upload", "active");
    for (const file of selectedFiles) {
      const base64 = arrayBufferToBase64(file.content);
      await githubApi(`/repos/${repo.full_name}/contents/${file.path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `Add ${file.path}`,
          content: base64,
        }),
      });
    }
    setProgress("ps-upload", "done");

    setProgress("ps-enable", "active");
    await githubApi(`/repos/${repo.full_name}/pages`, {
      method: "POST",
      body: JSON.stringify({
        source: { branch: "main", path: "/" },
      }),
    });
    setProgress("ps-enable", "done");

    const siteUrl = `https://${username}.github.io/${repoName}/`;
    $("site-url").href = siteUrl;
    $("site-url").textContent = siteUrl;
    showStep("done");
    pollForSite(siteUrl, repo.full_name);
  } catch (err) {
    const activeStep = document.querySelector(".progress-step.active");
    if (activeStep) activeStep.classList.replace("active", "error");
    showError(err.message);
  }
}

async function publishUpdate() {
  const repoFullName = `${username}/${updateRepo}`;

  showStep("publishing");
  $("ps-repo").textContent = "Preparing update...";
  setProgress("ps-repo", "active");

  try {
    let headRef;
    try {
      headRef = await githubApi(`/repos/${repoFullName}/git/ref/heads/main`);
    } catch (err) {
      if (err.message.includes("404") || err.message.includes("Not Found")) {
        showError("This site no longer exists. It may have been deleted.");
        return;
      }
      throw err;
    }
    const headSha = headRef.object.sha;
    setProgress("ps-repo", "done");

    setProgress("ps-upload", "active");
    $("ps-upload").textContent = "Uploading your files...";
    const blobPromises = selectedFiles.map(async (file) => {
      const base64 = arrayBufferToBase64(file.content);
      const blob = await githubApi(`/repos/${repoFullName}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: base64,
          encoding: "base64",
        }),
      });
      return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    });
    const treeItems = await Promise.all(blobPromises);

    const tree = await githubApi(`/repos/${repoFullName}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ tree: treeItems }),
    });

    const commit = await githubApi(`/repos/${repoFullName}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: "Update site via weejur",
        tree: tree.sha,
        parents: [headSha],
      }),
    });

    await githubApi(`/repos/${repoFullName}/git/refs/heads/main`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    });
    setProgress("ps-upload", "done");

    setProgress("ps-enable", "active");
    $("ps-enable").textContent = "Checking your website...";
    try {
      await githubApi(`/repos/${repoFullName}/pages`);
    } catch {
      await githubApi(`/repos/${repoFullName}/pages`, {
        method: "POST",
        body: JSON.stringify({
          source: { branch: "main", path: "/" },
        }),
      });
    }
    setProgress("ps-enable", "done");

    const siteUrl = `https://${username}.github.io/${updateRepo}/`;
    $("site-url").href = siteUrl;
    $("site-url").textContent = siteUrl;
    showStep("done");
    pollForSite(siteUrl, repoFullName);
  } catch (err) {
    const activeStep = document.querySelector(".progress-step.active");
    if (activeStep) activeStep.classList.replace("active", "error");
    showError(err.message);
  }
}

async function pollForSite(url, repoFullName) {
  const timeout = 120000;
  const interval = 4000;
  const startTime = Date.now();

  $("site-status-checking").hidden = false;
  $("site-status-live").hidden = true;
  $("site-status-slow").hidden = true;

  await new Promise((resolve) => setTimeout(resolve, interval));

  while (Date.now() - startTime < timeout) {
    try {
      // Check the actual URL via the worker (bypasses CORS)
      const res = await fetch(
        `${CONFIG.workerUrl}/check-site?url=${encodeURIComponent(url)}`,
      );
      const data = await res.json();
      if (data.status >= 200 && data.status < 400) {
        $("site-status-checking").hidden = true;
        $("site-status-live").hidden = false;
        $("done-heading").textContent = isUpdateMode
          ? "Your site has been updated!"
          : "Your site is live!";
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

function setProgress(id, state) {
  const el = $(id);
  el.classList.remove("active", "done", "error");
  el.classList.add(state);
}

// =============================================================================
// Done / Error
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

$("btn-new-site").addEventListener("click", () => {
  window.location.href = "new.html";
});

function showError(message) {
  $("error-message").textContent = message;
  steps.error.classList.add("active");
}

$("btn-retry").addEventListener("click", () => {
  steps.error.classList.remove("active");
  selectedFiles = [];
  picker.clear();
  document
    .querySelectorAll(".progress-step")
    .forEach((el) => el.classList.remove("active", "done", "error"));
  showStep("files");
});
