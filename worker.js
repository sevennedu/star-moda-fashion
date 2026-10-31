// Star Moda Fashion — servidor na Cloudflare (Workers + D1 + KV).
// Arquivos estáticos vêm de env.ASSETS; este arquivo cuida da página inicial
// (fotos e novidades vindas do banco), das imagens enviadas e da API.

const SESSAO_DIAS = 30;
const MAX_UPLOAD = 3 * 1024 * 1024;
const TIPOS_IMG = ["image/jpeg", "image/png", "image/webp"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") return paginaInicial(request, env);
      if (url.pathname.startsWith("/img/")) return imagem(url.pathname.slice(5), env);
      if (url.pathname.startsWith("/api/")) {
        if (request.method !== "GET" && !mesmaOrigem(request, url)) return json({ erro: "Origem não permitida." }, 403);
        return await api(request, env, url);
      }
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return json({ erro: "Erro no servidor. Tente novamente." }, 500);
    }
  },
};

// ---------- Página inicial: troca fotos e monta Novidades no servidor ----------

async function paginaInicial(request, env) {
  const [res, imgs, novs] = await Promise.all([
    env.ASSETS.fetch(new Request(new URL("/", request.url), request)),
    env.DB.prepare("SELECT chave, url, alt FROM imagens").all(),
    env.DB.prepare("SELECT nome, descricao, imagem FROM produtos WHERE ativo = 1 ORDER BY ordem, id DESC").all(),
  ]);
  const mapa = Object.fromEntries(imgs.results.map((r) => [r.chave, r]));
  const cards = novs.results.map(cardNovidade).join("");

  const out = new HTMLRewriter()
    .on("img[data-img]", {
      element(el) {
        const r = mapa[el.getAttribute("data-img")];
        if (!r) return;
        el.setAttribute("src", r.url);
        if (r.alt) el.setAttribute("alt", r.alt);
      },
    })
    .on("#novidades-lista", { element(el) { if (cards) el.setInnerContent(cards, { html: true }); } })
    .on("[data-sem-novidades]", { element(el) { if (!cards) el.setAttribute("hidden", ""); } })
    .transform(res);
  const h = new Headers(out.headers);
  h.set("Cache-Control", "no-cache");
  return new Response(out.body, { status: out.status, headers: h });
}

function cardNovidade(p) {
  const nome = esc(p.nome);
  const msg = esc(`Olá! Quero o vestido ${p.nome} que vi nas novidades do site.`);
  return `<a class="occasion reveal" data-wa data-msg="${msg}" href="#">
  <div class="occasion__img"><img src="${esc(p.imagem)}" loading="lazy" width="700" height="875" alt="${nome}"></div>
  <h3>${nome}</h3>${p.descricao ? `<p>${esc(p.descricao)}</p>` : ""}
  <span class="link">Quero este vestido <svg class="ic"><use href="#i-arrow"/></svg></span>
</a>`;
}

async function imagem(id, env) {
  const { value, metadata } = await env.IMAGENS.getWithMetadata(`img:${id}`, { type: "stream" });
  if (!value) return new Response("Não encontrada", { status: 404 });
  return new Response(value, {
    headers: { "Content-Type": metadata?.tipo || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

// ---------- API ----------

async function api(request, env, url) {
  const rota = `${request.method} ${url.pathname}`;
  const eu = await usuarioDaSessao(request, env);

  switch (rota) {
    case "POST /api/cadastro": return cadastro(request, env);
    case "POST /api/entrar": return entrar(request, env);
    case "POST /api/sair": return sair(request, env);
    case "GET /api/eu":
      return json({ usuario: eu && { nome: eu.nome, email: eu.email, telefone: eu.telefone, papel: eu.papel } });
    case "DELETE /api/eu":
      if (!eu) return json({ erro: "Entre na sua conta." }, 401);
      if (eu.papel === "admin") return json({ erro: "A conta de administrador não pode ser excluída por aqui." }, 400);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(eu.id),
        env.DB.prepare("DELETE FROM usuarios WHERE id = ?").bind(eu.id),
      ]);
      return json({ ok: true }, 200, { "Set-Cookie": cookieSessao("", 0) });
  }

  if (!url.pathname.startsWith("/api/admin/")) return json({ erro: "Não encontrado." }, 404);
  if (!eu || eu.papel !== "admin") return json({ erro: "Acesso só para administradores." }, 403);
  return admin(request, env, url, rota);
}

async function admin(request, env, url, rota) {
  const id = Number(url.searchParams.get("id"));

  switch (rota) {
    case "POST /api/admin/upload": {
      const form = await request.formData();
      const arq = form.get("arquivo");
      if (!arq || typeof arq === "string") return json({ erro: "Envie uma imagem." }, 400);
      if (!TIPOS_IMG.includes(arq.type)) return json({ erro: "Use JPG, PNG ou WebP." }, 400);
      if (arq.size > MAX_UPLOAD) return json({ erro: "Imagem maior que 3 MB." }, 400);
      const novoId = crypto.randomUUID();
      await env.IMAGENS.put(`img:${novoId}`, await arq.arrayBuffer(), { metadata: { tipo: arq.type } });
      return json({ url: `/img/${novoId}` });
    }

    case "GET /api/admin/imagens": {
      const r = await env.DB.prepare("SELECT chave, url, alt FROM imagens").all();
      return json({ imagens: r.results });
    }
    case "PUT /api/admin/imagens": {
      const { chave, url: nova, alt } = await request.json();
      if (!/^[a-z0-9-]{1,40}$/.test(chave || "") || !urlInterna(nova)) return json({ erro: "Dados inválidos." }, 400);
      const antiga = await env.DB.prepare("SELECT url FROM imagens WHERE chave = ?").bind(chave).first();
      await env.DB.prepare("INSERT INTO imagens (chave, url, alt) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET url = excluded.url, alt = excluded.alt")
        .bind(chave, nova, texto(alt, 200)).run();
      if (antiga && antiga.url !== nova) await apagarImg(env, antiga.url);
      return json({ ok: true });
    }
    case "DELETE /api/admin/imagens": {
      const chave = url.searchParams.get("chave") || "";
      const antiga = await env.DB.prepare("DELETE FROM imagens WHERE chave = ? RETURNING url").bind(chave).first();
      if (antiga) await apagarImg(env, antiga.url);
      return json({ ok: true });
    }

    case "GET /api/admin/produtos": {
      const r = await env.DB.prepare("SELECT id, nome, descricao, imagem, ordem, ativo FROM produtos ORDER BY ordem, id DESC").all();
      return json({ produtos: r.results });
    }
    case "POST /api/admin/produtos":
    case "PUT /api/admin/produtos": {
      const b = await request.json();
      const nome = texto(b.nome, 80);
      if (nome.length < 2 || !urlInterna(b.imagem)) return json({ erro: "Informe o nome e a foto do vestido." }, 400);
      const campos = [nome, texto(b.descricao, 200), b.imagem, Number(b.ordem) || 0, b.ativo === false ? 0 : 1];
      if (request.method === "POST") {
        await env.DB.prepare("INSERT INTO produtos (nome, descricao, imagem, ordem, ativo) VALUES (?, ?, ?, ?, ?)").bind(...campos).run();
      } else {
        const antiga = await env.DB.prepare("SELECT imagem FROM produtos WHERE id = ?").bind(id).first();
        if (!antiga) return json({ erro: "Produto não encontrado." }, 404);
        await env.DB.prepare("UPDATE produtos SET nome = ?, descricao = ?, imagem = ?, ordem = ?, ativo = ? WHERE id = ?").bind(...campos, id).run();
        if (antiga.imagem !== b.imagem) await apagarImg(env, antiga.imagem);
      }
      return json({ ok: true });
    }
    case "DELETE /api/admin/produtos": {
      const antiga = await env.DB.prepare("DELETE FROM produtos WHERE id = ? RETURNING imagem").bind(id).first();
      if (antiga) await apagarImg(env, antiga.imagem);
      return json({ ok: true });
    }

    case "GET /api/admin/clientes": {
      const r = await env.DB.prepare("SELECT id, nome, email, telefone, ativo, criado_em FROM usuarios WHERE papel = 'cliente' ORDER BY id DESC").all();
      return json({ clientes: r.results });
    }
    case "PATCH /api/admin/clientes": {
      const { ativo } = await request.json();
      await env.DB.batch([
        env.DB.prepare("UPDATE usuarios SET ativo = ? WHERE id = ? AND papel = 'cliente'").bind(ativo ? 1 : 0, id),
        ...(ativo ? [] : [env.DB.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(id)]),
      ]);
      return json({ ok: true });
    }
    case "DELETE /api/admin/clientes": {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessoes WHERE usuario_id = (SELECT id FROM usuarios WHERE id = ? AND papel = 'cliente')").bind(id),
        env.DB.prepare("DELETE FROM usuarios WHERE id = ? AND papel = 'cliente'").bind(id),
      ]);
      return json({ ok: true });
    }
  }
  return json({ erro: "Não encontrado." }, 404);
}

// ---------- Contas ----------

async function cadastro(request, env) {
  const b = await request.json();
  const nome = texto(b.nome, 80);
  const email = texto(b.email, 120).toLowerCase();
  const telefone = String(b.telefone || "").replace(/\D/g, "");
  const senha = String(b.senha || "");
  if (nome.length < 2) return json({ erro: "Informe o seu nome." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ erro: "E-mail inválido." }, 400);
  if (telefone.length < 10 || telefone.length > 13) return json({ erro: "Informe o WhatsApp com DDD." }, 400);
  if (senha.length < 8 || senha.length > 128) return json({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
  if (b.consentimento !== true) return json({ erro: "Aceite o uso dos seus dados para criar a conta." }, 400);

  const existe = await env.DB.prepare("SELECT 1 FROM usuarios WHERE email = ?").bind(email).first();
  if (existe) return json({ erro: "Este e-mail já tem conta. Use \"Entrar\"." }, 409);

  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const u = await env.DB.prepare("INSERT INTO usuarios (nome, email, telefone, senha_hash, senha_salt) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(nome, email, telefone, await hashSenha(senha, salt), salt).first();
  return iniciarSessao(env, u.id, { papel: "cliente" });
}

async function entrar(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  const chaveTentativas = `login:${ip}`;
  const tentativas = Number(await env.IMAGENS.get(chaveTentativas)) || 0;
  if (tentativas >= 10) return json({ erro: "Muitas tentativas. Aguarde 15 minutos." }, 429);

  const b = await request.json();
  const email = texto(b.email, 120).toLowerCase();
  const u = await env.DB.prepare("SELECT id, papel, ativo, senha_hash, senha_salt FROM usuarios WHERE email = ?").bind(email).first();
  const ok = u && iguais(await hashSenha(String(b.senha || ""), u.senha_salt), u.senha_hash);
  if (!ok) {
    await env.IMAGENS.put(chaveTentativas, String(tentativas + 1), { expirationTtl: 900 });
    return json({ erro: "E-mail ou senha incorretos." }, 401);
  }
  if (!u.ativo) return json({ erro: "Conta desativada. Fale com a loja pelo WhatsApp." }, 403);
  return iniciarSessao(env, u.id, { papel: u.papel });
}

async function sair(request, env) {
  const token = lerCookie(request, "sessao");
  if (token) await env.DB.prepare("DELETE FROM sessoes WHERE token = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": cookieSessao("", 0) });
}

async function iniciarSessao(env, usuarioId, extra) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const segundos = SESSAO_DIAS * 86400;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessoes WHERE expira_em < ?").bind(Date.now()),
    env.DB.prepare("INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)").bind(await sha256(token), usuarioId, Date.now() + segundos * 1000),
  ]);
  return json({ ok: true, ...extra }, 200, { "Set-Cookie": cookieSessao(token, segundos) });
}

async function usuarioDaSessao(request, env) {
  const token = lerCookie(request, "sessao");
  if (!token) return null;
  return env.DB.prepare(
    "SELECT u.id, u.nome, u.email, u.telefone, u.papel FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND s.expira_em > ? AND u.ativo = 1"
  ).bind(await sha256(token), Date.now()).first();
}

// ---------- Utilidades ----------

async function hashSenha(senha, salt) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 }, chave, 256);
  return hex(new Uint8Array(bits));
}
const sha256 = async (s) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
function iguais(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}

const cookieSessao = (valor, maxAge) => `sessao=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
function lerCookie(request, nome) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${nome}=([a-f0-9]{64})`));
  return m && m[1];
}
function mesmaOrigem(request, url) {
  const origem = request.headers.get("Origin");
  return !origem || origem === url.origin;
}
const urlInterna = (u) => typeof u === "string" && /^\/(img\/[0-9a-f-]{36}|assets\/img\/[a-z0-9-]+\.jpg)$/.test(u);
async function apagarImg(env, u) {
  if (u && u.startsWith("/img/")) await env.IMAGENS.delete(`img:${u.slice(5)}`);
}
const texto = (v, max) => String(v ?? "").trim().slice(0, max);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const json = (dados, status = 200, headers = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
