const rows = document.querySelector("#client-rows");
const dialog = document.querySelector("#client-dialog");
const form = document.querySelector("#client-form");
const toast = document.querySelector("#toast");
const deleteDialog = document.querySelector("#delete-dialog");
const authScreen = document.querySelector("#auth-screen");
const appShell = document.querySelector("#app-shell");
let selectedDeleteId = null;
let toastTimer;
let currentUser = null;

const statusLabels = { active: "Activo", prospect: "Prospecto", lead: "Nuevo contacto" };
const initials = (name) => String(name || "").split(" ").slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Ha ocurrido un error.");
  return data;
}
function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function showAuth(mode = "register") {
  authScreen.hidden = false;
  appShell.hidden = true;
  const isRegister = mode === "register";
  document.querySelector("#register-form").hidden = !isRegister;
  document.querySelector("#login-form").hidden = isRegister;
  document.querySelector("#show-register").classList.toggle("active", isRegister);
  document.querySelector("#show-login").classList.toggle("active", !isRegister);
  document.querySelector("#auth-title").textContent = isRegister ? "Crea tu cuenta" : "Bienvenido de nuevo";
  document.querySelector("#auth-intro").textContent = isRegister
    ? "Organiza tus clientes y gestiona tus relaciones desde un único lugar."
    : "Inicia sesión para acceder a tu espacio de trabajo.";
  document.querySelector("#auth-error").textContent = "";
}
function showApp(user) {
  currentUser = user;
  authScreen.hidden = true;
  appShell.hidden = false;
  document.querySelector("#sidebar-user-name").textContent = user.name;
  document.querySelector("#sidebar-user-email").textContent = user.email;
  document.querySelector("#welcome-user-name").textContent = user.name.split(" ")[0];
  document.querySelector(".avatar").textContent = initials(user.name);
  refresh().catch((error) => notify(error.message));
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}
async function loadStats() {
  const stats = await request("/api/stats");
  document.querySelector("#stat-total").textContent = stats.total;
  document.querySelector("#stat-active").textContent = stats.active;
  document.querySelector("#stat-prospects").textContent = stats.prospects;
  document.querySelector("#stat-leads").textContent = stats.leads;
}
let currentPage = 1, totalPages = 1, searchTimer;
async function loadClients() {
  const params = new URLSearchParams();
  const values = {search:document.querySelector("#search").value.trim(),status:document.querySelector("#status-filter").value,from:document.querySelector("#date-from").value,to:document.querySelector("#date-to").value,sort:document.querySelector("#sort-filter").value,page:currentPage,limit:document.querySelector("#page-size").value};
  Object.entries(values).forEach(([k,v])=>{if(v!=="")params.set(k,v);});
  const result=await request(`/api/clients?${params}`);
  totalPages=result.pages;
  rows.innerHTML=result.items.map(client=>{
    const created=client.created_at?new Date(client.created_at.replace(" ","T")+"Z").toLocaleDateString("es-ES"):"—";
    return `<tr><td><div class="client-cell"><span class="client-avatar">${escapeHtml(initials(client.name))}</span><span>${escapeHtml(client.name)}<small>${escapeHtml(client.email)}</small></span></div></td><td>${escapeHtml(client.company||"—")}</td><td><span class="status ${escapeHtml(client.status)}">${statusLabels[client.status]||"—"}</span></td><td>${escapeHtml(client.phone||"—")}</td><td>${created}</td><td><div class="row-actions"><button data-edit="${Number(client.id)}" aria-label="Editar ${escapeHtml(client.name)}" title="Editar">✎</button><button data-delete="${Number(client.id)}" aria-label="Eliminar ${escapeHtml(client.name)}" title="Eliminar">×</button></div></td></tr>`;
  }).join("");
  document.querySelector("#result-count").textContent=`${result.total} cliente${result.total===1?"":"s"}`;
  document.querySelector("#empty-state").hidden=result.total!==0;
  document.querySelector(".table-wrap").hidden=result.total===0;
  document.querySelector(".pagination").hidden=result.total===0;
  document.querySelector("#page-info").textContent=`Página ${result.page} de ${result.pages}`;
  document.querySelector("#prev-page").disabled=result.page<=1;
  document.querySelector("#next-page").disabled=result.page>=result.pages;
}
async function refresh() { await Promise.all([loadStats(), loadClients()]); }
function openNew() {
  form.reset();
  document.querySelector("#client-id").value = "";
  document.querySelector("#dialog-title").textContent = "Nuevo cliente";
  document.querySelector("#form-error").textContent = "";
  dialog.showModal();
}
async function submitAuth(formElement, endpoint) {
  const errorBox = document.querySelector("#auth-error");
  const button = formElement.querySelector('button[type="submit"]');
  errorBox.textContent = "";
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(formElement).entries());
    const result = await request(endpoint, { method: "POST", body: JSON.stringify(payload) });
    showApp(result.user);
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
// Mostrar u ocultar los campos de contraseña y el código temporal.
document.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-password-toggle]");
  if (!toggle) return;
  const field = toggle.closest(".password-field");
  const input = field && field.querySelector("input");
  if (!input) return;
  const reveal = input.type === "password";
  input.type = reveal ? "text" : "password";
  toggle.setAttribute("aria-pressed", String(reveal));
  toggle.setAttribute("aria-label", reveal ? "Ocultar contraseña" : "Mostrar contraseña");
  toggle.innerHTML = reveal
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-4 4.7"></path><path d="M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>' ;
});

document.querySelector("#show-register").addEventListener("click", () => showAuth("register"));
document.querySelector("#show-login").addEventListener("click", () => showAuth("login"));
document.querySelector("#register-form").addEventListener("submit", (event) => {
  event.preventDefault(); submitAuth(event.currentTarget, "/api/auth/register");
});
document.querySelector("#login-form").addEventListener("submit", (event) => {
  event.preventDefault(); submitAuth(event.currentTarget, "/api/auth/login");
});
document.querySelector("#bootstrap-form").addEventListener("submit", (event) => {
  event.preventDefault(); submitAuth(event.currentTarget, "/api/auth/bootstrap-admin");
});
document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await request("/api/auth/logout", { method: "POST" });
    currentUser = null;
    showAuth("login");
    notify("Has cerrado sesión.");
  } catch (error) { notify(error.message); }
});
document.querySelector("#add-client").addEventListener("click", openNew);
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => dialog.close());
function openView(view) {
  document.querySelector(".main").classList.toggle("view-clients",view==="clients");
  document.querySelectorAll("[data-view]").forEach(link=>link.classList.toggle("active",link.dataset.view===view));
  document.querySelector(".topbar h1").textContent=view==="clients"?"Clientes":"Resumen";
  document.querySelector("#clients-page").hidden=view!=="clients";
  history.replaceState(null,"",view==="clients"?"#clients":"#dashboard");
  if(view==="clients"){currentPage=1;loadClients().catch(error=>notify(error.message));}
}
document.querySelectorAll("[data-view]").forEach(link=>link.addEventListener("click",e=>{e.preventDefault();openView(link.dataset.view);}));
document.querySelector("#search").addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{currentPage=1;loadClients().catch(error=>notify(error.message));},220);});
["#status-filter","#date-from","#date-to","#sort-filter","#page-size"].forEach(sel=>document.querySelector(sel).addEventListener("change",()=>{currentPage=1;loadClients().catch(error=>notify(error.message));}));
document.querySelector("#prev-page").addEventListener("click",()=>{if(currentPage>1){currentPage--;loadClients().catch(error=>notify(error.message));}});
document.querySelector("#next-page").addEventListener("click",()=>{if(currentPage<totalPages){currentPage++;loadClients().catch(error=>notify(error.message));}});

rows.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  try {
    if (editButton) {
      const clients = await request("/api/clients");
      const client = clients.find((item) => item.id === Number(editButton.dataset.edit));
      if (!client) return;
      form.elements.name.value = client.name;
      form.elements.email.value = client.email;
      form.elements.company.value = client.company || "";
      form.elements.phone.value = client.phone || "";
      form.elements.status.value = client.status;
      form.elements.notes.value = client.notes || "";
      document.querySelector("#client-id").value = client.id;
      document.querySelector("#dialog-title").textContent = "Editar cliente";
      document.querySelector("#form-error").textContent = "";
      dialog.showModal();
    }
    if (deleteButton) {
      selectedDeleteId = Number(deleteButton.dataset.delete);
      const clientName = deleteButton.closest("tr").querySelector(".client-cell span:last-child").childNodes[0].textContent.trim();
      document.querySelector("#delete-client-name").textContent = clientName;
      deleteDialog.showModal();
    }
  } catch (error) { notify(error.message); }
});
document.querySelector("#cancel-delete").addEventListener("click", () => {
  deleteDialog.close(); selectedDeleteId = null;
});
document.querySelector("#confirm-delete").addEventListener("click", async () => {
  if (!selectedDeleteId) return;
  const button = document.querySelector("#confirm-delete");
  button.disabled = true;
  try {
    await request(`/api/clients/${selectedDeleteId}`, { method: "DELETE" });
    deleteDialog.close(); selectedDeleteId = null;
    notify("Cliente eliminado correctamente."); await refresh();
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const id = document.querySelector("#client-id").value;
  const errorBox = document.querySelector("#form-error");
  try {
    await request(id ? `/api/clients/${id}` : "/api/clients", {
      method: id ? "PUT" : "POST", body: JSON.stringify(data),
    });
    dialog.close(); notify(id ? "Cliente actualizado." : "Cliente creado correctamente.");
    await refresh();
  } catch (error) { errorBox.textContent = error.message; }
});

(async function init() {
  try {
    const result = await request("/api/auth/me");
    showApp(result.user);
    if(location.hash==="#clients") openView("clients");
  } catch {
    showAuth("register");
  }
})();
