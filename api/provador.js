// Provador virtual — função da Vercel.
// Usa o Gemini (Nano Banana 2.1) quando existe GEMINI_API_KEY; senão usa a FASHN (FASHN_API_KEY).
// As chaves ficam nas variáveis de ambiente da Vercel, nunca no site.
//
// GET  /api/provador?saude=1   -> { ativo, provedor }
// POST /api/provador           { foto: "data:image/jpeg;base64,...", vestido: "madrinha-azul", proporcao: "3:4" }
//                              -> Gemini: { status: "pronto", imagem }   |   FASHN: { id }
// GET  /api/provador?id=<id>   -> (FASHN) { status: "processando" | "pronto" | "erro", imagem?, erro? }

const SITE_URL = process.env.SITE_URL || "https://star-moda-fashion.vercel.app";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-nano-banana-2.1";
const FASHN = "https://api.fashn.ai/v1";

// Só os vestidos do catálogo podem ser usados (evita uso da API para outras coisas).
const VESTIDOS = {
  "lilas-longo": "hero-vestido-lilas.jpg",
  "madrinha-azul": "madrinha-vestido-azul.jpg",
  "vinho-transpassado": "mae-dos-noivos-vestido-vinho.jpg",
  "magenta-um-ombro": "formatura-vestido-magenta.jpg",
  "estampado-fenda": "festa-vestido-estampado.jpg",
  "preto-renda": "destaque-vestido-preto-renda.jpg",
  "verde-cetim": "destaque-vestido-verde-um-ombro.jpg",
  "azul-listrado": "insta-vestido-azul-listrado.jpg",
  "verde-midi": "insta-vestido-verde.jpg",
  "floral-branco": "insta-vestido-floral.jpg",
};
const PROPORCOES = ["1:1", "2:3", "3:4", "4:5", "9:16", "3:2", "4:3", "5:4", "16:9"];

const PROMPT = [
  "You are a virtual fitting room for a dress boutique.",
  "IMAGE 1 is the customer. IMAGE 2 shows a dress worn by a store model.",
  "Create one photorealistic photo of the SAME person from IMAGE 1 wearing exactly the dress from IMAGE 2.",
  "Keep the customer identical: same face and facial features, identity, skin tone, hair, body shape, height, proportions, pose, hands, and the same background, framing and lighting of IMAGE 1.",
  "Copy the dress faithfully: color, fabric, texture, print, neckline, sleeves, waist, length, slit and details, fitted naturally to the customer's body.",
  "Do not use the model's face, body, accessories or background from IMAGE 2. Do not beautify, slim or reshape the customer. Do not add text or logos.",
].join(" ");

const ERRO_PADRAO = "Não foi possível gerar a imagem agora. Tente novamente.";
const MENSAGENS = {
  PoseError: "Não conseguimos ver o seu corpo inteiro na foto. Envie uma foto de frente, da cabeça aos pés, com boa luz.",
  ImageLoadError: "Não conseguimos abrir a sua foto. Tente outra imagem (JPG ou PNG).",
  ContentModerationError: "Essa foto não pode ser usada no provador. Tente outra foto.",
  ConcurrencyLimitExceeded: "Muitas clientes estão usando o provador agora. Tente de novo em alguns segundos.",
};
const MAX_FOTO_BYTES = 3.5 * 1024 * 1024; // limite de envio da Vercel é 4,5 MB

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

// Procura a primeira imagem devolvida, aceitando os formatos de resposta conhecidos da API do Gemini.
function acharImagem(no) {
  if (!no || typeof no !== "object") return null;
  if (no.type === "image" && typeof no.data === "string") return { data: no.data, mime: no.mime_type || "image/png" };
  const inline = no.inline_data || no.inlineData;
  if (inline && typeof inline.data === "string") return { data: inline.data, mime: inline.mime_type || inline.mimeType || "image/png" };
  for (const v of Array.isArray(no) ? no : Object.values(no)) {
    const achou = acharImagem(v);
    if (achou) return achou;
  }
  return null;
}

// ---------- Gemini ----------
async function provarGemini(key, foto, arquivo, proporcao) {
  const [, mimeFoto, dadosFoto] = foto.match(/^data:(image\/[\w+]+);base64,(.+)$/) || [];
  const roupa = await fetch(`${SITE_URL}/assets/img/${arquivo}`);
  if (!roupa.ok) throw new Error(`vestido indisponível (${roupa.status})`);
  const dadosRoupa = Buffer.from(await roupa.arrayBuffer()).toString("base64");

  const r = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: [
        { type: "text", text: PROMPT },
        { type: "text", text: "IMAGE 1 (customer):" },
        { type: "image", mime_type: mimeFoto, data: dadosFoto },
        { type: "text", text: "IMAGE 2 (dress):" },
        { type: "image", mime_type: "image/jpeg", data: dadosRoupa },
      ],
      response_format: { type: "image", aspect_ratio: proporcao, image_size: "1K", mime_type: "image/jpeg" },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("gemini:", r.status, JSON.stringify(data).slice(0, 500));
    if (r.status === 429 && /free tier|limit: 0/i.test(JSON.stringify(data))) {
      // projeto do Google sem faturamento ativo: geração de imagem não liberada
      return { status: 503, body: { erro: "O provador virtual está sendo configurado. Volte em breve!" } };
    }
    if (r.status === 429) return { status: 429, body: { erro: MENSAGENS.ConcurrencyLimitExceeded } };
    if (r.status === 400 && /safety|blocked|policy/i.test(JSON.stringify(data))) {
      return { status: 400, body: { erro: MENSAGENS.ContentModerationError } };
    }
    return { status: 502, body: { erro: ERRO_PADRAO } };
  }
  const img = acharImagem(data.steps || data.outputs || data);
  if (!img) {
    console.error("gemini sem imagem:", JSON.stringify(data).slice(0, 500));
    return { status: 502, body: { erro: "A IA não conseguiu montar o look com essa foto. Tente uma foto de frente, de corpo inteiro." } };
  }
  return { status: 200, body: { status: "pronto", imagem: `data:${img.mime};base64,${img.data}` } };
}

// ---------- FASHN ----------
async function provarFashn(key, foto, arquivo) {
  const r = await fetch(`${FASHN}/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_name: "tryon-v1.6",
      inputs: {
        model_image: foto,
        garment_image: `${SITE_URL}/assets/img/${arquivo}`,
        category: "one-pieces",
        garment_photo_type: "model",
        mode: "quality",
        output_format: "jpeg",
        return_base64: true,
      },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error || !data.id) {
    const err = data.error || (r.status === 429 ? { name: "ConcurrencyLimitExceeded" } : {});
    return { status: r.status === 429 ? 429 : 502, body: { erro: MENSAGENS[err.name] || ERRO_PADRAO } };
  }
  return { status: 200, body: { id: data.id } };
}

async function statusFashn(key, id) {
  const r = await fetch(`${FASHN}/status/${id}`, { headers: { Authorization: `Bearer ${key}` } });
  const data = await r.json().catch(() => ({}));
  if (data.status === "completed" && Array.isArray(data.output) && data.output[0]) {
    return { status: "pronto", imagem: data.output[0] };
  }
  if (data.status === "failed" || !r.ok) {
    return { status: "erro", erro: (data.error && MENSAGENS[data.error.name]) || ERRO_PADRAO };
  }
  return { status: "processando" };
}

// ---------- Rota ----------
module.exports = async function handler(req, res) {
  const gemini = process.env.GEMINI_API_KEY;
  const fashn = process.env.FASHN_API_KEY;
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.searchParams.has("saude")) {
    return json(res, 200, { ativo: Boolean(gemini || fashn), provedor: gemini ? "gemini" : fashn ? "fashn" : null });
  }
  if (!gemini && !fashn) {
    return json(res, 503, { erro: "O provador virtual está sendo configurado. Volte em breve!" });
  }

  try {
    if (req.method === "POST") {
      const { foto, vestido, proporcao } = await lerCorpo(req);
      const arquivo = VESTIDOS[vestido];
      if (!arquivo) return json(res, 400, { erro: "Escolha um vestido do catálogo." });
      if (typeof foto !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(foto)) {
        return json(res, 400, { erro: "Envie uma foto em JPG ou PNG." });
      }
      if (foto.length * 0.75 > MAX_FOTO_BYTES) {
        return json(res, 413, { erro: "A foto é muito grande. Tente uma imagem menor." });
      }
      const ratio = PROPORCOES.includes(proporcao) ? proporcao : "3:4";
      const out = gemini ? await provarGemini(gemini, foto, arquivo, ratio) : await provarFashn(fashn, foto, arquivo);
      return json(res, out.status, out.body);
    }

    if (req.method === "GET" && fashn && !gemini) {
      const id = url.searchParams.get("id");
      if (!id || !/^[\w-]{6,80}$/.test(id)) return json(res, 400, { erro: "Pedido inválido." });
      return json(res, 200, await statusFashn(fashn, id));
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { erro: "Método não permitido." });
  } catch (e) {
    console.error("provador:", e);
    return json(res, 500, { erro: ERRO_PADRAO });
  }
};
