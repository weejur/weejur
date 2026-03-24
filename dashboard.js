// =============================================================================
// dashboard.js — List, edit, delete ShipSite repos
// =============================================================================

if (!requireAuth()) throw new Error("Not authenticated");

const username = getUsername();
$("nav-username").textContent = username;
$("btn-signout").addEventListener("click", signOut);

// =============================================================================
// Fetch and display sites
// =============================================================================

async function loadSites() {
  try {
    const data = await githubApi(
      `/search/repositories?q=topic:shipsite+user:${username}&sort=updated&order=desc`
    );
    const repos = data.items || [];

    $("loading").hidden = true;

    if (repos.length === 0) {
      $("empty-state").hidden = false;
      return;
    }

    const list = $("site-list");
    list.hidden = false;

    for (const repo of repos) {
      const liveUrl = `https://${username}.github.io/${repo.name}/`;
      const card = document.createElement("div");
      card.className = "site-card";
      card.id = `card-${repo.name}`;
      card.innerHTML = `
        <div class="site-card-info">
          <h3 class="site-card-name">${repo.name}</h3>
          <a href="${liveUrl}" class="site-card-url" target="_blank" rel="noopener">${liveUrl}</a>
          <a href="https://github.com/${username}/${repo.name}" class="site-card-repo" target="_blank" rel="noopener">View repo on GitHub</a>
        </div>
        <div class="site-card-actions">
          <a href="new.html?edit=${encodeURIComponent(repo.name)}" class="btn btn-secondary btn-small">Edit</a>
          <button class="btn btn-danger btn-small" data-repo="${repo.name}">Delete</button>
        </div>
      `;
      list.appendChild(card);
    }

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
