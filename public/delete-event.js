export function wireEventDeletion(panel, getAccess, onDeleted) {
  const trigger = panel.querySelector("[data-open-delete]");
  const dialog = panel.querySelector("dialog");
  const form = dialog.querySelector("form");
  const cancel = form.querySelector("[data-cancel-delete]");
  const confirm = form.querySelector("button[type=submit]");
  const status = form.querySelector("[data-delete-message]");
  let access;

  trigger.addEventListener("click", () => {
    access = getAccess();
    dialog.querySelector("[data-delete-title]").textContent = access.title ? `Supprimer « ${access.title} » ?` : "Supprimer l’événement ?";
    status.textContent = "";
    dialog.showModal();
  });

  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => {
    if (confirm.disabled) event.preventDefault();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (confirm.disabled) return;
    const { apiBase, token } = access;
    if (!token) {
      status.textContent = "Ouvre le lien privé de configuration pour supprimer cet événement.";
      return;
    }

    confirm.disabled = cancel.disabled = true;
    status.textContent = "Suppression en cours…";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${apiBase}/admin/event`, {
        method: "DELETE",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 404) {
        const current = await fetch(`${apiBase}/config`, { cache: "no-store", signal: controller.signal });
        if (current.status !== 404) {
          status.textContent = "Vérifie que tu utilises le lien privé de configuration de cet événement.";
          return;
        }
      } else if (response.status !== 204) {
        throw new Error("Deletion failed");
      }

      dialog.close();
      onDeleted();
    } catch {
      status.textContent = "Impossible de confirmer la suppression. Réessaie dans un instant.";
    } finally {
      clearTimeout(timeout);
      confirm.disabled = cancel.disabled = false;
    }
  });
}
