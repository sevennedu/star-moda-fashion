/* Star Moda Fashion — painel do admin (fotos, novidades, clientes) */
const $ = (id) => document.getElementById(id);

// Fotos de vestidos do site que o admin pode trocar (chave = data-img no index.html)
const SLOTS = [
  ["hero", "Topo (foto em arco)", "hero-vestido-lilas"],
  ["madrinha", "Vitrine: Madrinha", "madrinha-vestido-azul"],
  ["mae-dos-noivos", "Vitrine: Mãe dos noivos", "mae-dos-noivos-vestido-vinho"],
  ["formatura", "Vitrine: Formatura", "formatura-vestido-magenta"],
  ["festa", "Vitrine: Festas e eventos", "festa-vestido-estampado"],
  ["dia-a-dia", "Vitrine: Dia a dia", "dia-a-dia-camisa-listrada"],
  ["destaque-1", "Destaque 1", "destaque-vestido-preto-renda"],
  ["destaque-2", "Destaque 2", "destaque-vestido-verde-um-ombro"],
  ["destaque-3", "Destaque 3", "destaque-tricot-marinho"],
  ["insta-1", "Instagram 1", "insta-vestido-azul-listrado"],
  ["insta-2", "Instagram 2", "insta-vestido-verde"],
  ["insta-3", "Instagram 3", "insta-vestido-estampado"],
  ["insta-4", "Instagram 4", "insta-conjunto-azul-claro"],
  ["insta-5", "Instagram 5", "insta-vestido-floral"],
];

const api = (url, metodo = "GET", dados) =>
  fetch(url, {
    method: metodo,
    headers: dados instanceof FormData || !dados ? {} : { "Content-Type": "application/json" },
    body: dados instanceof FormData ? dados : dados && JSON.stringify(dados),
  })
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || "Algo deu errado.");
      return d;
    });

const aviso = (texto, ok = true) => {
  const m = $("msg");
  m.textContent = texto;
  m.className = `msg ${ok ? "msg--ok" : "msg--erro"}`;
  m.hidden = !texto;
};
const falhou = (e) => aviso(e.message, false);
const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...filhos);
  return n;
};

// Reduz a foto para até 1000 px de largura, JPG ~82 (padrão do site)
const prepararFoto = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 1000 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível ler a imagem."))), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir essa imagem.")); };
    img.src = url;
  });

const enviarFoto = async (file) => {
  const f = new FormData();
  f.append("arquivo", await prepararFoto(file), "foto.jpg");
  return (await api("/api/admin/upload", "POST", f)).url;
};

// ---------- Fotos ----------
async function carregarFotos() {
  const { imagens } = await api("/api/admin/imagens");
  const trocadas = Object.fromEntries(imagens.map((i) => [i.chave, i]));
  $("slots").replaceChildren(
    ...SLOTS.map(([chave, rotulo, padrao]) => {
      const atual = trocadas[chave];
      const input = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: true });
      const trocar = el("button", { type: "button", className: "btn btn--dark", textContent: "Trocar" });
      trocar.onclick = () => input.click();
      input.onchange = async () => {
        if (!input.files[0]) return;
        const alt = prompt("Descreva a foto (cor, modelo, ocasião):", atual?.alt || "") ?? "";
        trocar.disabled = true;
        try {
          await api("/api/admin/imagens", "PUT", { chave, url: await enviarFoto(input.files[0]), alt });
          aviso(`Foto "${rotulo}" trocada.`);
          carregarFotos();
        } catch (e) { falhou(e); trocar.disabled = false; }
      };
      const acoes = el("div", { className: "actions" }, trocar, input);
      if (atual) {
        const voltar = el("button", { type: "button", className: "btn btn--outline", textContent: "Original" });
        voltar.onclick = () => api(`/api/admin/imagens?chave=${chave}`, "DELETE").then(() => { aviso(`"${rotulo}" voltou à foto original.`); carregarFotos(); }, falhou);
        acoes.append(voltar);
      }
      return el("div", { className: "slot" },
        el("img", { src: atual ? atual.url : `/assets/img/${padrao}.jpg`, alt: "", loading: "lazy" }),
        el("strong", { textContent: rotulo }),
        acoes);
    })
  );
}

// ---------- Novidades ----------
const form = $("form-produto");
let produtoEmEdicao = null;

const limparForm = () => {
  form.reset();
  produtoEmEdicao = null;
  $("produto-titulo").textContent = "Novo vestido";
  $("produto-cancelar").hidden = true;
};
$("produto-cancelar").onclick = limparForm;

async function carregarProdutos() {
  const { produtos } = await api("/api/admin/produtos");
  if (!produtos.length) return $("produtos").replaceChildren(el("tr", {}, el("td", { colSpan: 4, textContent: "Nenhum vestido em Novidades ainda." })));
  $("produtos").replaceChildren(
    ...produtos.map((p) => {
      const editar = el("button", { type: "button", className: "btn btn--outline", textContent: "Editar" });
      editar.onclick = () => {
        produtoEmEdicao = p;
        form.nome.value = p.nome;
        form.descricao.value = p.descricao;
        form.ordem.value = p.ordem;
        form.ativo.checked = !!p.ativo;
        $("produto-titulo").textContent = `Editando: ${p.nome}`;
        $("produto-cancelar").hidden = false;
        form.scrollIntoView({ behavior: "smooth" });
      };
      const apagar = el("button", { type: "button", className: "btn btn--danger", textContent: "Apagar" });
      apagar.onclick = () => confirm(`Apagar "${p.nome}" das novidades?`) &&
        api(`/api/admin/produtos?id=${p.id}`, "DELETE").then(() => { aviso("Vestido apagado."); carregarProdutos(); }, falhou);
      return el("tr", { className: p.ativo ? "" : "inativo" },
        el("td", {}, el("img", { src: p.imagem, alt: "", loading: "lazy" })),
        el("td", {}, el("strong", { textContent: p.nome }), el("br"), document.createTextNode(p.descricao)),
        el("td", { textContent: p.ativo ? "Sim" : "Não" }),
        el("td", {}, el("div", { className: "actions" }, editar, apagar)));
    })
  );
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const botao = form.querySelector("button[type=submit]");
  const arquivo = form.foto.files[0];
  if (!produtoEmEdicao && !arquivo) return aviso("Escolha a foto do vestido.", false);
  botao.disabled = true;
  try {
    const dados = {
      nome: form.nome.value,
      descricao: form.descricao.value,
      ordem: Number(form.ordem.value) || 0,
      ativo: form.ativo.checked,
      imagem: arquivo ? await enviarFoto(arquivo) : produtoEmEdicao.imagem,
    };
    if (produtoEmEdicao) await api(`/api/admin/produtos?id=${produtoEmEdicao.id}`, "PUT", dados);
    else await api("/api/admin/produtos", "POST", dados);
    aviso(produtoEmEdicao ? "Vestido atualizado." : "Vestido adicionado às novidades.");
    limparForm();
    carregarProdutos();
  } catch (err) { falhou(err); }
  botao.disabled = false;
});

// ---------- Clientes ----------
async function carregarClientes() {
  const { clientes } = await api("/api/admin/clientes");
  if (!clientes.length) return $("clientes").replaceChildren(el("tr", {}, el("td", { colSpan: 5, textContent: "Nenhuma cliente cadastrada ainda." })));
  $("clientes").replaceChildren(
    ...clientes.map((c) => {
      const zap = el("a", { href: `https://wa.me/${c.telefone.length <= 11 ? "55" : ""}${c.telefone}`, target: "_blank", rel: "noopener", textContent: c.telefone });
      const ativar = el("button", { type: "button", className: "btn btn--outline", textContent: c.ativo ? "Desativar" : "Ativar" });
      ativar.onclick = () => api(`/api/admin/clientes?id=${c.id}`, "PATCH", { ativo: !c.ativo }).then(carregarClientes, falhou);
      const apagar = el("button", { type: "button", className: "btn btn--danger", textContent: "Excluir" });
      apagar.onclick = () => confirm(`Excluir a conta de ${c.nome}? Isso não pode ser desfeito.`) &&
        api(`/api/admin/clientes?id=${c.id}`, "DELETE").then(() => { aviso("Cliente excluída."); carregarClientes(); }, falhou);
      return el("tr", { className: c.ativo ? "" : "inativo" },
        el("td", { textContent: c.nome }),
        el("td", { textContent: c.email }),
        el("td", {}, zap),
        el("td", { textContent: new Date(c.criado_em.replace(" ", "T") + "Z").toLocaleDateString("pt-BR") }),
        el("td", {}, el("div", { className: "actions" }, ativar, apagar)));
    })
  );
}

// ---------- Abas, sair e checagem de acesso ----------
document.querySelectorAll("[data-aba]").forEach((tab) =>
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-aba]").forEach((t) => t.setAttribute("aria-selected", t === tab));
    document.querySelectorAll("[data-painel]").forEach((p) => (p.hidden = p.dataset.painel !== tab.dataset.aba));
    aviso("");
  })
);
$("sair").onclick = () => api("/api/sair", "POST").finally(() => (location.href = "/"));

api("/api/eu").then(({ usuario }) => {
  if (!usuario || usuario.papel !== "admin") return location.replace("/entrar.html");
  $("conteudo").hidden = false;
  Promise.all([carregarFotos(), carregarProdutos(), carregarClientes()]).catch(falhou);
}, () => location.replace("/entrar.html"));
