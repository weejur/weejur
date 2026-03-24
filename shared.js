// =============================================================================
// Shared — Config, auth helpers, GitHub API wrapper, utilities
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
  return localStorage.getItem("shipsite_token");
}

function setToken(token) {
  localStorage.setItem("shipsite_token", token);
}

function getUsername() {
  return localStorage.getItem("shipsite_username");
}

function setUsername(name) {
  localStorage.setItem("shipsite_username", name);
}

function clearToken() {
  localStorage.removeItem("shipsite_token");
  localStorage.removeItem("shipsite_username");
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = "index.html";
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
    window.location.href = "index.html";
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
