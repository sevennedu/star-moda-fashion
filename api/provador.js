// Provador virtual — função da Vercel que conversa com a API da FASHN (https://docs.fashn.ai).
// A chave fica na variável de ambiente FASHN_API_KEY (configurada no painel da Vercel), nunca no site.
//
// POST /api/provador            { foto: "data:image/jpeg;base64,...", vestido: "madrinha-azul" } -> { id }
// GET  /api/provador?id=<id>    -> { status, imagem?, erro? }
// GET  /api/provador?saude=1    -> { ativo: true|false }

const FASHN = "https://api.fashn.ai/v1";
const SITE_URL = process.env.SITE_URL || "https://star-moda-fashion.vercel.app";

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

function mensagemDeErro(err) {
  if (!err) return "Não foi possível gerar a imagem agora. Tente novamente.";
  return MENSAGENS[err.name] || "Não foi possível gerar a imagem agora. Tente novamente.";
}

module.exports = async function handler(req, res) {
  const key = process.env.FASHN_API_KEY;
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.searchParams.has("saude")) {
    return json(res, 200, { ativo: Boolean(key) });
  }
  if (!key) {
    return json(res, 503, { erro: "O provador virtual está sendo configurado. Volte em breve!" });
  }

  try {
    // Inicia a prova
    if (req.method === "POST") {
      const { foto, vestido } = await lerCorpo(req);
      const arquivo = VESTIDOS[vestido];
      if (!arquivo) return json(res, 400, { erro: "Escolha um vestido do catálogo." });
      if (typeof foto !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(foto)) {
        return json(res, 400, { erro: "Envie uma foto em JPG ou PNG." });
      }
      if (foto.length * 0.75 > MAX_FOTO_BYTES) {
        return json(res, 413, { erro: "A foto é muito grande. Tente uma imagem menor." });
      }

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
            return_base64: true, // a imagem não fica guardada em servidor público
          },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error || !data.id) {
        const err = data.error || (r.status === 429 ? { name: "ConcurrencyLimitExceeded" } : null);
        return json(res, r.status === 429 ? 429 : 502, { erro: mensagemDeErro(err) });
      }
      return json(res, 200, { id: data.id });
    }

    // Consulta o andamento
    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id || !/^[\w-]{6,80}$/.test(id)) return json(res, 400, { erro: "Pedido inválido." });
      const r = await fetch(`${FASHN}/status/${id}`, { headers: { Authorization: `Bearer ${key}` } });
      const data = await r.json().catch(() => ({}));
      if (data.status === "completed" && Array.isArray(data.output) && data.output[0]) {
        return json(res, 200, { status: "pronto", imagem: data.output[0] });
      }
      if (data.status === "failed" || !r.ok) {
        return json(res, 200, { status: "erro", erro: mensagemDeErro(data.error) });
      }
      return json(res, 200, { status: "processando" });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { erro: "Método não permitido." });
  } catch (e) {
    console.error("provador:", e);
    return json(res, 500, { erro: "Não foi possível gerar a imagem agora. Tente novamente." });
  }
};
