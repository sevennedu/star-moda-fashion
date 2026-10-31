/* Star Moda Fashion — entrar, criar conta, sair e excluir conta */
const $ = (id) => document.getElementById(id);
const enviar = (url, metodo, dados) =>
  fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: dados && JSON.stringify(dados) })
    .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({ erro: "Erro de conexão." }))) }))
    .catch(() => ({ ok: false, erro: "Sem conexão. Tente novamente." }));

const mostrarErro = (el, texto) => { el.textContent = texto; el.hidden = !texto; };

fetch("/api/eu").then((r) => r.json()).then(({ usuario }) => {
  if (!usuario) return ($("deslogada").hidden = false);
  $("logada").hidden = false;
  $("eu-nome").textContent = usuario.nome;
  $("eu-email").textContent = usuario.email;
  if (usuario.papel === "admin") { $("ir-painel").hidden = false; $("excluir").hidden = true; }
});

// Abas Entrar / Criar conta
document.querySelectorAll("[data-aba]").forEach((tab) =>
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-aba]").forEach((t) => t.setAttribute("aria-selected", t === tab));
    document.querySelectorAll("[data-painel]").forEach((f) => (f.hidden = f.dataset.painel !== tab.dataset.aba));
    mostrarErro($("msg"), "");
  })
);

const aoEnviar = (form, url, montar) =>
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const botao = form.querySelector("button[type=submit]");
    botao.disabled = true;
    const r = await enviar(url, "POST", montar(new FormData(form)));
    botao.disabled = false;
    if (!r.ok) return mostrarErro($("msg"), r.erro);
    location.href = r.papel === "admin" ? "/admin.html" : "/#vitrine";
  });

aoEnviar($("form-entrar"), "/api/entrar", (f) => ({ email: f.get("email"), senha: f.get("senha") }));
aoEnviar($("form-cadastro"), "/api/cadastro", (f) => ({
  nome: f.get("nome"), email: f.get("email"), telefone: f.get("telefone"), senha: f.get("senha"), consentimento: f.get("consentimento") === "on",
}));

$("sair").addEventListener("click", async () => { await enviar("/api/sair", "POST"); location.href = "/"; });
$("excluir").addEventListener("click", async () => {
  if (!confirm("Excluir a sua conta e os seus dados? Isso não pode ser desfeito.")) return;
  const r = await enviar("/api/eu", "DELETE");
  if (!r.ok) return mostrarErro($("msg-conta"), r.erro);
  location.href = "/";
});
