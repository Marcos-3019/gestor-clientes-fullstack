const rows = document.querySelector("#client-rows");
const dialog = document.querySelector("#client-dialog");
const form = document.querySelector("#client-form");
const toast = document.querySelector("#toast");
let toastTimer;

const statusLabels = { active: "Activo", prospect: "Prospecto", lead: "Nuevo contacto" };
const initials = name => name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase();

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Ha ocurrido un error.");
  return data;
}
function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
}
async function loadStats() {
  const stats = await request("/api/stats");
  document.querySelector("#stat-total").textContent = stats.total;
  document.querySelector("#stat-active").textContent = stats.active;
  document.querySelector("#stat-prospects").textContent = stats.prospects;
  document.querySelector("#stat-leads").textContent = stats.leads;
}
async function loadClients() {
  const params = new URLSearchParams();
  if (document.querySelector("#search").value.trim()) params.set("search", document.querySelector("#search").value.trim());
  if (document.querySelector("#status-filter").value) params.set("status", document.querySelector("#status-filter").value);
  const clients = await request(`/api/clients?${params}`);
  rows.innerHTML = clients.map(client => `
    <tr>
      <td><div class="client-cell"><span class="client-avatar">${escapeHtml(initials(client.name))}</span><span>${escapeHtml(client.name)}<small>${escapeHtml(client.email)}</small></span></div></td>
      <td>${escapeHtml(client.company || "—")}</td>
      <td><span class="status ${client.status}">${statusLabels[client.status]}</span></td>
      <td>${escapeHtml(client.phone || "—")}</td>
      <td><div class="row-actions"><button data-edit="${client.id}" aria-label="Editar ${escapeHtml(client.name)}" title="Editar">✎</button><button data-delete="${client.id}" aria-label="Eliminar ${escapeHtml(client.name)}" title="Eliminar">×</button></div></td>
    </tr>`).join("");
  document.querySelector("#result-count").textContent = `${clients.length} resultado${clients.length === 1 ? "" : "s"}`;
  document.querySelector("#empty-state").hidden = clients.length !== 0;
  document.querySelector(".table-wrap").hidden = clients.length === 0;
}
async function refresh() { await Promise.all([loadStats(), loadClients()]); }
function openNew() {
  form.reset();
  document.querySelector("#client-id").value = "";
  document.querySelector("#dialog-title").textContent = "Nuevo cliente";
  document.querySelector("#form-error").textContent = "";
  dialog.showModal();
}
document.querySelector("#add-client").addEventListener("click", openNew);
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#search").addEventListener("input", () => loadClients().catch(error => notify(error.message)));
document.querySelector("#status-filter").addEventListener("change", () => loadClients().catch(error => notify(error.message)));

rows.addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  try {
    if (editButton) {
      const clients = await request("/api/clients");
      const client = clients.find(item => item.id === Number(editButton.dataset.edit));
      if (!client) return;
      form.elements.name.value = client.name;
      form.elements.email.value = client.email;
      form.elements.company.value = client.company;
      form.elements.phone.value = client.phone;
      form.elements.status.value = client.status;
      form.elements.notes.value = client.notes;
      document.querySelector("#client-id").value = client.id;
      document.querySelector("#dialog-title").textContent = "Editar cliente";
      document.querySelector("#form-error").textContent = "";
      dialog.showModal();
    }
    if (deleteButton) {
      const id = Number(deleteButton.dataset.delete);
      if (!confirm("¿Seguro que quieres eliminar este cliente? Esta acción no se puede deshacer.")) return;
      await request(`/api/clients/${id}`, { method: "DELETE" });
      notify("Cliente eliminado correctamente.");
      await refresh();
    }
  } catch (error) { notify(error.message); }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const id = document.querySelector("#client-id").value;
  const errorBox = document.querySelector("#form-error");
  try {
    await request(id ? `/api/clients/${id}` : "/api/clients", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data)
    });
    dialog.close();
    notify(id ? "Cliente actualizado." : "Cliente creado correctamente.");
    await refresh();
  } catch (error) { errorBox.textContent = error.message; }
});

refresh().catch(error => notify(error.message));
