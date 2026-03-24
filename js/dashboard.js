// =============================================================================
// dashboard.js — List, update, delete weejur repos
// =============================================================================

if (!requireAuth()) throw new Error("Not authenticated");

const username = getUsername();
initNavbar();


// =============================================================================
// Fetch and display sites
// =============================================================================

async function loadSites() {
  try {
    const allRepos = await githubApi(
      `/user/repos?type=owner&sort=updated&per_page=100`
    );
    const repos = (allRepos || []).filter(
      (r) => r.topics && r.topics.includes("weejur")
    );

    $("loading").hidden = true;

    if (repos.length === 0) {
      $("empty-state").hidden = false;
      return;
    }

    const list = $("site-list");
    list.hidden = false;
    $("btn-new-site").hidden = false;
    $("dashboard-help").hidden = false;

    for (const repo of repos) {
      const liveUrl = `https://${username}.github.io/${repo.name}/`;
      const card = document.createElement("div");
      card.className = "site-card";
      card.id = `card-${repo.name}`;
      card.innerHTML = `
        <div class="site-card-info">
          <h3 class="site-card-name">
            <span class="site-card-name-text"></span>
            <button class="site-card-copy" title="Copy link">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </h3>
          <a class="site-card-url" target="_blank" rel="noopener"></a>
          <a class="site-card-repo" target="_blank" rel="noopener">View repo on GitHub</a>
        </div>
        <div class="site-card-actions">
          <a class="btn btn-secondary btn-small">Update</a>
          <button class="btn btn-danger btn-small">Delete</button>
        </div>
      `;
      card.querySelector(".site-card-name-text").textContent = repo.name;
      card.querySelector(".site-card-copy").dataset.url = liveUrl;
      const urlLink = card.querySelector(".site-card-url");
      urlLink.href = liveUrl;
      urlLink.textContent = liveUrl;
      card.querySelector(".site-card-repo").href = `https://github.com/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}`;
      card.querySelector(".btn-secondary").href = `/new?update=${encodeURIComponent(repo.name)}`;
      card.querySelector(".btn-danger").dataset.repo = repo.name;
      list.appendChild(card);
    }

    // Attach copy handlers
    list.querySelectorAll(".site-card-copy").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(btn.dataset.url);
        const svg = btn.querySelector("svg");
        const original = svg.innerHTML;
        svg.innerHTML = '<polyline points="20 6 9 17 4 12" />';
        setTimeout(() => { svg.innerHTML = original; }, 1500);
      });
    });

    // Attach delete handlers
    list.querySelectorAll("[data-repo]").forEach((btn) => {
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.repo));
    });
  } catch (err) {
    $("loading").textContent = "Failed to load sites. Please try again.";
  }
}

// =============================================================================
// Delete modal
// =============================================================================

let deleteTarget = null;

function openDeleteModal(repoName) {
  deleteTarget = repoName;
  $("delete-repo-name").textContent = repoName;
  $("delete-confirm-input").value = "";
  $("btn-delete-confirm").disabled = true;
  $("delete-modal").hidden = false;
  $("delete-confirm-input").focus();
}

function closeDeleteModal() {
  deleteTarget = null;
  $("delete-modal").hidden = true;
}

$("delete-confirm-input").addEventListener("input", () => {
  $("btn-delete-confirm").disabled =
    $("delete-confirm-input").value !== deleteTarget;
});

$("btn-delete-cancel").addEventListener("click", closeDeleteModal);

$("delete-modal").addEventListener("click", (e) => {
  if (e.target === $("delete-modal")) closeDeleteModal();
});

$("btn-delete-confirm").addEventListener("click", async () => {
  if (!deleteTarget) return;

  const repoName = deleteTarget;
  $("btn-delete-confirm").disabled = true;
  $("btn-delete-confirm").textContent = "Deleting...";

  try {
    await githubApi(`/repos/${username}/${repoName}`, {
      method: "DELETE",
    });

    // Remove card from DOM
    const card = $(`card-${repoName}`);
    if (card) card.remove();

    closeDeleteModal();
    $("btn-delete-confirm").textContent = "Delete this site";

    // If no cards left, show empty state
    if ($("site-list").children.length === 0) {
      $("site-list").hidden = true;
      $("btn-new-site").hidden = true;
      $("dashboard-help").hidden = true;
      $("empty-state").hidden = false;
    }
  } catch (err) {
    $("btn-delete-confirm").textContent = "Delete this site";
    $("btn-delete-confirm").disabled = false;
    alert("Failed to delete: " + err.message);
  }
});

// =============================================================================
// Init
// =============================================================================

loadSites();
