/* Star Moda Fashion — interações */

// Número da loja (DDI + DDD + número, só dígitos).
const CONFIG = {
  whatsapp: "5518981280955",
  whatsappLabel: "(18) 98128-0955",
  mensagemPadrao: "Olá! Vim pelo site da Star Moda Fashion e quero mais informações.",
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Links de WhatsApp (com o nome da cliente, se ela estiver conectada)
const aplicarWhatsApp = (nome) =>
  document.querySelectorAll("[data-wa]").forEach((el) => {
    const msg = (el.dataset.msg || CONFIG.mensagemPadrao) + (nome ? ` Meu nome é ${nome}.` : "");
    el.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
    el.target = "_blank";
    el.rel = "noopener";
  });
aplicarWhatsApp();

// Conta: mostra "Olá, Nome" (ou "Painel" para o admin) no cabeçalho
const contaLink = document.getElementById("conta-link");
if (contaLink) {
  fetch("/api/eu")
    .then((r) => r.json())
    .then(({ usuario }) => {
      if (!usuario) return;
      const primeiro = usuario.nome.split(" ")[0];
      contaLink.querySelector("span").textContent = usuario.papel === "admin" ? "Painel" : `Olá, ${primeiro}`;
      if (usuario.papel === "admin") contaLink.href = "/admin.html";
      else aplicarWhatsApp(usuario.nome);
    })
    .catch(() => {});
}
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

// Cabeçalho: sombra ao rolar + barra de progresso de leitura
const header = document.querySelector(".header");
const progressBar = document.getElementById("progress-bar");
const heroPhoto = document.querySelector(".hero__photo");
let tickAgendado = false;
const onScroll = () => {
  if (tickAgendado) return;
  tickAgendado = true;
  requestAnimationFrame(() => {
    tickAgendado = false;
    const y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 20);
    if (progressBar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.setProperty("--progress", max > 0 ? Math.min(1, y / max) : 0);
    }
    if (heroPhoto && !reduceMotion && y < window.innerHeight) {
      heroPhoto.style.setProperty("--parallax", `${y * 0.06}px`);
    }
  });
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Topo: textos e foto entram em sequência ao carregar a página
const hero = document.querySelector(".hero");
if (hero) requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add("is-ready")));

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
// Atraso em cascata: conta a posição de cada item entre os irmãos com .reveal
// do mesmo grupo (grade de cards, lista etc.), não a posição na página inteira.
const indicePorGrupo = new WeakMap();
document.querySelectorAll(".reveal").forEach((el) => {
  const grupo = el.parentElement;
  const indice = indicePorGrupo.get(grupo) || 0;
  indicePorGrupo.set(grupo, indice + 1);
  el.style.transitionDelay = `${Math.min(indice, 5) * 80}ms`;
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
