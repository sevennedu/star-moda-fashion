/* Star Moda Fashion — interações */

// Número da loja (DDI + DDD + número, só dígitos).
const CONFIG = {
  whatsapp: "5518981280955",
  whatsappLabel: "(18) 98128-0955",
  mensagemPadrao: "Olá! Vim pelo site da Star Moda Fashion e quero mais informações.",
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Links de WhatsApp
document.querySelectorAll("[data-wa]").forEach((el) => {
  const msg = el.dataset.msg || CONFIG.mensagemPadrao;
  el.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
  el.target = "_blank";
  el.rel = "noopener";
});
document.querySelectorAll("[data-wa-label]").forEach((el) => (el.textContent = CONFIG.whatsappLabel));

// Aberto agora / fechado agora (seg a sex 9h–18h, sáb 9h–13h, horário de Brasília)
const statusEl = document.getElementById("status-loja");
if (statusEl) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", minute: "numeric", hour12: false })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const now = (parseInt(parts.hour, 10) % 24) + parseInt(parts.minute, 10) / 60;
  const closesAt = parts.weekday === "Sat" ? 13 : 18;
  const open = parts.weekday !== "Sun" && now >= 9 && now < closesAt;
  statusEl.textContent = open ? "Aberto agora" : "Fechado agora";
  statusEl.classList.add(open ? "status--open" : "status--closed");
  statusEl.hidden = false;
}

// Ano no rodapé
const ano = document.getElementById("ano");
if (ano) ano.textContent = new Date().getFullYear();

// Cabeçalho: sombra ao rolar
const header = document.querySelector(".header");
const onScroll = () => {
  const y = window.scrollY;
  header.classList.toggle("is-scrolled", y > 20);
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Menu do celular
const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("menu");
const setHeaderH = () => document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
setHeaderH();
window.addEventListener("resize", setHeaderH);
toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", open);
  toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
});
nav.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  })
);

// Faixa do topo no celular: duplica o conteúdo para o letreiro correr sem emenda
const track = document.querySelector(".topbar__track");
if (track && window.matchMedia("(max-width: 900px)").matches) {
  track.innerHTML += track.innerHTML;
}

// Revelar elementos ao rolar
const revealer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("is-visible");
        revealer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 5) * 70}ms`;
  revealer.observe(el);
});

// ===== Depoimentos em movimento =====
// Duplica os cards para o carrossel girar sem emenda e ajusta a velocidade ao tamanho.
document.querySelectorAll(".marquee").forEach((m) => {
  const track = m.querySelector(".marquee__track");
  if (!reduceMotion) {
    [...track.children].forEach((card) => {
      const clone = card.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      track.appendChild(clone);
    });
  }
  const setSpeed = () => {
    const pxPerSecond = window.innerWidth < 600 ? 28 : 40;
    m.style.setProperty("--dur", `${track.scrollWidth / 2 / pxPerSecond}s`);
  };
  setSpeed();
  window.addEventListener("resize", setSpeed);
  // No celular: segura o dedo para parar e ler
  m.addEventListener("touchstart", () => m.classList.add("is-paused"), { passive: true });
  m.addEventListener("touchend", () => setTimeout(() => m.classList.remove("is-paused"), 1500));
});

// ===== Provador virtual =====
const provador = document.getElementById("provador-form");
if (provador) {
  const inputFoto = document.getElementById("foto");
  const drop = document.getElementById("drop");
  const preview = document.getElementById("foto-preview");
  const consent = document.getElementById("consentimento");
  const botao = document.getElementById("provar");
  const box = document.getElementById("resultado");
  const elEmpty = box.querySelector(".result__empty");
  const elLoading = box.querySelector(".result__loading");
  const elMsg = box.querySelector(".result__msg");
  const elImg = box.querySelector(".result__img");
  const elErro = box.querySelector(".result__error");
  const acoes = provador.querySelector(".result__actions");
  const quero = document.getElementById("quero");
  const baixar = document.getElementById("baixar");
  let fotoData = null;
  let fotoProporcao = "3:4";
  let ativo = true;

  const mostrar = (estado, texto) => {
    elEmpty.hidden = estado !== "vazio";
    elLoading.hidden = estado !== "carregando";
    elImg.hidden = estado !== "pronto";
    elErro.hidden = estado !== "erro";
    box.classList.toggle("is-loading", estado === "carregando");
    if (estado === "erro") elErro.textContent = texto;
    if (estado === "carregando" && texto) elMsg.textContent = texto;
    acoes.hidden = estado !== "pronto";
  };

  // Verifica se o provador está configurado no servidor
  fetch("/api/provador?saude=1")
    .then((r) => r.json())
    .then((d) => { ativo = !!d.ativo; })
    .catch(() => { ativo = false; })
    .finally(() => {
      if (!ativo) {
        botao.disabled = true;
        mostrar("erro", "O provador virtual está sendo configurado. Volte em breve!");
      }
    });

  // Reduz a foto (máx. 1296 px) para enviar rápido
  const prepararFoto = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1296;
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        // proporção mais próxima entre as aceitas pela IA
        const opcoes = { "9:16": 9 / 16, "2:3": 2 / 3, "3:4": 3 / 4, "4:5": 4 / 5, "1:1": 1, "5:4": 5 / 4, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9 };
        const r = img.width / img.height;
        fotoProporcao = Object.keys(opcoes).reduce((a, b) => (Math.abs(opcoes[b] - r) < Math.abs(opcoes[a] - r) ? b : a));
        resolve(c.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagem")); };
      img.src = url;
    });

  const receberArquivo = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      fotoData = await prepararFoto(file);
      preview.src = fotoData;
      preview.hidden = false;
      drop.querySelector(".drop__empty").hidden = true;
      drop.querySelector(".drop__change").hidden = false;
      if (ativo) mostrar("vazio");
    } catch {
      mostrar("erro", "Não conseguimos abrir essa imagem. Tente uma foto em JPG ou PNG.");
    }
  };

  inputFoto.addEventListener("change", () => receberArquivo(inputFoto.files[0]));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", (e) => receberArquivo(e.dataTransfer.files[0]));

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const frases = ["Analisando a sua foto…", "Vestindo o modelo escolhido…", "Ajustando caimento e luz…", "Quase pronto…"];

  provador.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ativo) return;
    const escolhido = provador.querySelector('input[name="vestido"]:checked');
    if (!fotoData) return mostrar("erro", "Envie uma foto sua de corpo inteiro (passo 1).");
    if (!escolhido) return mostrar("erro", "Escolha um vestido (passo 2).");
    if (!consent.checked) return mostrar("erro", "Marque a autorização de uso da foto para continuar.");

    botao.disabled = true;
    mostrar("carregando", frases[0]);
    let f = 0;
    const girar = setInterval(() => { elMsg.textContent = frases[Math.min(++f, frases.length - 1)]; }, 4000);
    try {
      const r = await fetch("/api/provador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto: fotoData, vestido: escolhido.value, proporcao: fotoProporcao }),
      });
      const d = await r.json();
      const pronto = (imagem) => {
        elImg.src = imagem;
        baixar.href = imagem;
        const msg = `Olá! Usei o provador virtual do site e quero o vestido ${escolhido.dataset.nome}.`;
        quero.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
        mostrar("pronto");
      };
      if (r.ok && d.imagem) return pronto(d.imagem); // Gemini responde na hora
      if (!r.ok || !d.id) throw new Error(d.erro || "Não foi possível começar a prova.");

      const inicio = Date.now();
      while (Date.now() - inicio < 120000) {
        await esperar(2500);
        const s = await fetch(`/api/provador?id=${encodeURIComponent(d.id)}`).then((x) => x.json());
        if (s.status === "pronto") return pronto(s.imagem);
        if (s.status === "erro") throw new Error(s.erro);
      }
      throw new Error("Demorou mais que o esperado. Tente novamente.");
    } catch (err) {
      mostrar("erro", err.message || "Não foi possível gerar a imagem agora. Tente novamente.");
    } finally {
      clearInterval(girar);
      botao.disabled = !ativo;
    }
  });
}

// ===== Fachada animada =====
const scene = document.getElementById("scene");
if (scene) {
  const tilt = scene.querySelector(".scene__tilt");
  const hint = scene.querySelector(".scene__hint");
  const doorHit = scene.querySelector(".door-hit");

  // Acende o letreiro quando a fachada aparece na tela (depois das fontes carregarem)
  const turnOn = () => scene.classList.add("is-on");
  const lightObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(turnOn, 250));
        lightObserver.disconnect();
      }
    },
    { threshold: 0.35 }
  );
  lightObserver.observe(scene);

  // Abre / fecha a porta
  const setOpen = (open) => {
    scene.classList.toggle("is-open", open);
    hint.setAttribute("aria-pressed", open);
    hint.querySelector("span").textContent = open ? "Seja bem-vinda!" : "Toque na porta e entre";
  };
  hint.addEventListener("click", () => setOpen(!scene.classList.contains("is-open")));
  doorHit.addEventListener("click", () => setOpen(!scene.classList.contains("is-open")));
  doorHit.addEventListener("mouseenter", () => setOpen(true));
  doorHit.addEventListener("mouseleave", () => setOpen(false));

  // Profundidade: inclina a cena e move as camadas conforme o mouse
  if (!reduceMotion) {
    let raf = null;
    const set = (mx, my) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        scene.style.setProperty("--mx", mx.toFixed(3));
        scene.style.setProperty("--my", my.toFixed(3));
      });
    };
    scene.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = tilt.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
    });
    scene.addEventListener("pointerleave", () => set(0, 0));

    // No celular, um leve movimento acompanhando a rolagem
    if (window.matchMedia("(hover: none)").matches) {
      window.addEventListener(
        "scroll",
        () => {
          const r = tilt.getBoundingClientRect();
          const p = (r.top + r.height / 2) / window.innerHeight - 0.5;
          set(0, Math.max(-1, Math.min(1, p * 1.6)));
        },
        { passive: true }
      );
    }
  } else {
    turnOn();
  }
}
