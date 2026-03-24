// =============================================================================
// Shared — Config, auth helpers, GitHub API wrapper, utilities (weejur)
// =============================================================================

const CONFIG = {
  githubClientId: "Ov23liRRI1gWCv1OktMJ",
  workerUrl: "http://localhost:8787",
};

const $ = (id) => document.getElementById(id);

// =============================================================================
// Auth (localStorage)
// =============================================================================

function getToken() {
  return localStorage.getItem("weejur_token");
}

function setToken(token) {
  localStorage.setItem("weejur_token", token);
}

function getUsername() {
  return localStorage.getItem("weejur_username");
}

function setUsername(name) {
  localStorage.setItem("weejur_username", name);
}

function clearToken() {
  localStorage.removeItem("weejur_token");
  localStorage.removeItem("weejur_username");
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = "index.html?login";
    return false;
  }
  return true;
}

function signOut() {
  clearToken();
  window.location.href = "index.html";
}

// =============================================================================
// GitHub API
// =============================================================================

async function githubApi(endpoint, options = {}) {
  const token = getToken();
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = "index.html?login";
    return;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub API error: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// =============================================================================
// Utilities
// =============================================================================

function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "");
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// =============================================================================
// Pending files (IndexedDB) — survive OAuth redirects
// =============================================================================

function openPendingDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("weejur", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("pending_files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePendingFiles(files) {
  const db = await openPendingDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending_files", "readwrite");
    tx.objectStore("pending_files").put(files, "pending");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function hasPendingFiles() {
  const db = await openPendingDB();
  return new Promise((resolve) => {
    const tx = db.transaction("pending_files", "readonly");
    const req = tx.objectStore("pending_files").get("pending");
    req.onsuccess = () => resolve(req.result && req.result.length > 0);
    req.onerror = () => resolve(false);
  });
}

async function loadPendingFiles() {
  const db = await openPendingDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending_files", "readwrite");
    const store = tx.objectStore("pending_files");
    const req = store.get("pending");
    req.onsuccess = () => {
      store.delete("pending");
      resolve(req.result || null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function clearPendingFiles() {
  const db = await openPendingDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending_files", "readwrite");
    tx.objectStore("pending_files").delete("pending");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =============================================================================
// File picker — shared between landing page and new.js
// =============================================================================

function initFilePicker({ onFilesReady }) {
  let selectedFiles = [];

  const dropZone = $("drop-zone");
  const fileInput = $("file-input");
  const folderInput = $("folder-input");

  // Tabs
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      $("panel-upload").hidden = target !== "upload";
      $("panel-paste").hidden = target !== "paste";
    });
  });

  // Folder/file buttons
  $("btn-pick-folder").addEventListener("click", (e) => {
    e.stopPropagation();
    folderInput.click();
  });

  $("btn-pick-files").addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Drag and drop
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
      if (entry) promises.push(readEntry(entry, ""));
    }
    await Promise.all(promises);

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
      const entries = await new Promise((resolve) => reader.readEntries(resolve));
      for (const child of entries) {
        await readEntry(child, dirPath);
      }
    }
  }

  // Folder input
  folderInput.addEventListener("change", async () => {
    selectedFiles = [];
    const files = folderInput.files;
    const paths = Array.from(files).map((f) => f.webkitRelativePath || f.name);
    const commonPrefix = findCommonPrefix(paths);
    for (const file of files) {
      const content = await file.arrayBuffer();
      let path = file.webkitRelativePath || file.name;
      if (commonPrefix) path = path.substring(commonPrefix.length);
      selectedFiles.push({ path, content });
    }
    displayFiles();
  });

  // File input
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
    const sorted = [...selectedFiles].sort((a, b) => a.path.localeCompare(b.path));
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
      warning.textContent = "⚠ No index.html found. Add a file called index.html to be your site's home page.";
      list.prepend(warning);
    }
    onFilesReady(selectedFiles);
  }

  // Clear
  $("btn-clear-files").addEventListener("click", () => {
    selectedFiles = [];
    fileInput.value = "";
    folderInput.value = "";
    $("file-list").hidden = true;
    dropZone.hidden = false;
    onFilesReady(null);
  });

  // Paste HTML helper
  function getPastedFiles() {
    const html = $("html-paste").value.trim();
    if (!html) return null;
    const encoder = new TextEncoder();
    return [{ path: "index.html", content: encoder.encode(html).buffer }];
  }

  return {
    getFiles: () => selectedFiles.length > 0 ? selectedFiles : null,
    getPastedFiles,
    setFiles: (files) => {
      selectedFiles = files;
      displayFiles();
    },
    clear: () => {
      selectedFiles = [];
      fileInput.value = "";
      folderInput.value = "";
      $("file-list").hidden = true;
      dropZone.hidden = false;
    },
  };
}

function findCommonPrefix(paths) {
  if (paths.length === 0) return "";
  const parts = paths[0].split("/");
  if (parts.length > 1) {
    const prefix = parts[0] + "/";
    if (paths.every((p) => p.startsWith(prefix))) {
      return prefix;
    }
  }
  return "";
}
