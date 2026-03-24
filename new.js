// =============================================================================
// new.js — Create or edit a site
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
const editRepo = params.get("edit");
const isEditMode = !!editRepo;

// =============================================================================
// Edit mode setup
// =============================================================================

if (isEditMode) {
  $("files-step-label").textContent = "Step 1";
  $("files-heading").textContent = `Update ${editRepo}`;
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
// Tabs (Upload vs Paste)
// =============================================================================

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    $("panel-upload").hidden = target !== "upload";
    $("panel-paste").hidden = target !== "paste";
  });
});

// =============================================================================
// File Selection
// =============================================================================

const dropZone = $("drop-zone");
const fileInput = $("file-input");
const folderInput = $("folder-input");

$("btn-pick-folder").addEventListener("click", (e) => {
  e.stopPropagation();
  folderInput.click();
});

$("btn-pick-files").addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");

  const items = e.dataTransfer.items;
  if (!items) return;

  selectedFiles = [];
  const promises = [];

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      promises.push(readEntry(entry, ""));
    }
  }

  await Promise.all(promises);

  // If a single folder was dropped, strip the folder name from all paths
  if (selectedFiles.length > 0) {
    const paths = selectedFiles.map((f) => f.path);
    const commonPrefix = findCommonPrefix(paths);
    if (commonPrefix) {
      for (const file of selectedFiles) {
        file.path = file.path.substring(commonPrefix.length);
      }
    }
  }

  displayFiles();
});

async function readEntry(entry, basePath) {
  if (entry.isFile) {
    const file = await new Promise((resolve) => entry.file(resolve));
    const content = await file.arrayBuffer();
    const path = basePath ? `${basePath}/${entry.name}` : entry.name;
    selectedFiles.push({ path, content });
  } else if (entry.isDirectory) {
    const dirPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    const reader = entry.createReader();
    const entries = await new Promise((resolve) =>
      reader.readEntries(resolve)
    );
    for (const child of entries) {
      await readEntry(child, dirPath);
    }
  }
}

folderInput.addEventListener("change", async () => {
  selectedFiles = [];
  const files = folderInput.files;

  const paths = Array.from(files).map((f) => f.webkitRelativePath || f.name);
  const commonPrefix = findCommonPrefix(paths);

  for (const file of files) {
    const content = await file.arrayBuffer();
    let path = file.webkitRelativePath || file.name;
    if (commonPrefix) {
      path = path.substring(commonPrefix.length);
    }
    selectedFiles.push({ path, content });
  }

  displayFiles();
});

fileInput.addEventListener("change", async () => {
  selectedFiles = [];

  for (const file of fileInput.files) {
    const content = await file.arrayBuffer();
    selectedFiles.push({ path: file.name, content });
  }

  displayFiles();
});

function displayFiles() {
  if (selectedFiles.length === 0) return;

  const list = $("file-list-items");
  list.innerHTML = "";

  const sorted = [...selectedFiles].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  for (const file of sorted) {
    const li = document.createElement("li");
    li.textContent = file.path;
    list.appendChild(li);
  }

  dropZone.hidden = true;
  $("file-list").hidden = false;

  const hasIndex = selectedFiles.some(
    (f) => f.path === "index.html" || f.path.endsWith("/index.html")
  );
  if (!hasIndex) {
    const warning = document.createElement("li");
    warning.style.color = "#9a6700";
    warning.style.fontFamily = "inherit";
    warning.textContent =
      "⚠ No index.html found. Add a file called index.html to be your site's home page.";
    list.prepend(warning);
  }
}

$("btn-clear-files").addEventListener("click", () => {
  selectedFiles = [];
  fileInput.value = "";
  folderInput.value = "";
  $("file-list").hidden = true;
  dropZone.hidden = false;
});

$("btn-files-next").addEventListener("click", () => {
  if (selectedFiles.length === 0) return;
  if (isEditMode) {
    publish();
  } else {
    showStep("name");
    $("site-name").focus();
    updateUrlPreview();
  }
});

// =============================================================================
// Paste HTML
// =============================================================================

$("btn-paste-next").addEventListener("click", () => {
  const html = $("html-paste").value.trim();
  if (!html) return;

  const encoder = new TextEncoder();
  selectedFiles = [{ path: "index.html", content: encoder.encode(html).buffer }];

  if (isEditMode) {
    publish();
  } else {
    showStep("name");
    $("site-name").focus();
    updateUrlPreview();
  }
});

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
  if (isEditMode) {
    await publishEdit();
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
        description: "Website published with ShipSite",
        auto_init: false,
        private: false,
      }),
    });

    // Topics must be set via a separate API call
    await githubApi(`/repos/${repo.full_name}/topics`, {
      method: "PUT",
      body: JSON.stringify({ names: ["shipsite"] }),
    });
    setProgress("ps-repo", "done");

    setProgress("ps-upload", "active");
    // Upload files sequentially via Contents API (works on empty repos)
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

async function publishEdit() {
  const repoFullName = `${username}/${editRepo}`;

  showStep("publishing");
  $("ps-repo").textContent = "Preparing update...";
  setProgress("ps-repo", "active");

  try {
    // 1. Get HEAD SHA
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

    // 2. Upload blobs in parallel
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

    // 3. Create tree (no base_tree = full replacement)
    const tree = await githubApi(`/repos/${repoFullName}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ tree: treeItems }),
    });

    // 4. Create commit
    const commit = await githubApi(`/repos/${repoFullName}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: "Update site via ShipSite",
        tree: tree.sha,
        parents: [headSha],
      }),
    });

    // 5. Update ref
    await githubApi(`/repos/${repoFullName}/git/refs/heads/main`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    });
    setProgress("ps-upload", "done");

    // 6. Ensure Pages is still enabled
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

    const siteUrl = `https://${username}.github.io/${editRepo}/`;
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
  const publishedAt = new Date().toISOString();
  const timeout = 120000; // 2 minutes
  const interval = 5000; // check every 5 seconds
  const startTime = Date.now();

  $("site-status-checking").hidden = false;
  $("site-status-live").hidden = true;
  $("site-status-slow").hidden = true;

  await new Promise((resolve) => setTimeout(resolve, interval));

  while (Date.now() - startTime < timeout) {
    try {
      // Check Pages builds for one that completed after we published
      const builds = await githubApi(
        `/repos/${repoFullName}/pages/builds`
      );
      const recentBuild = builds.find(
        (b) => new Date(b.created_at) >= new Date(publishedAt)
      );
      if (recentBuild && recentBuild.status === "built") {
        $("site-status-checking").hidden = true;
        $("site-status-live").hidden = false;
        $("done-heading").textContent = isEditMode
          ? "Your site has been updated!"
          : "Your site is live!";
        return;
      }
      if (recentBuild && recentBuild.status === "errored") {
        $("site-status-checking").hidden = true;
        $("site-status-slow").hidden = false;
        $("site-status-slow").querySelector("p").textContent =
          "The deployment encountered an error. Try visiting the link below, or check the repository on GitHub for details.";
        return;
      }
    } catch {
      // API error, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // Timeout reached
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
  fileInput.value = "";
  folderInput.value = "";
  $("file-list").hidden = true;
  dropZone.hidden = false;
  document
    .querySelectorAll(".progress-step")
    .forEach((el) => el.classList.remove("active", "done", "error"));
  showStep("files");
});
