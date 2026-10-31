# Star Moda Fashion — Landing page

Site em HTML, CSS e JS puros, hospedado na Cloudflare (Workers + D1 + KV). Publicar: `npx wrangler deploy`.

## Estrutura
- `index.html` — página completa, incluindo a fachada animada (SVG dentro da seção "Nossa loja").
- `css/styles.css` — cores da marca, layout e animações.
- `js/main.js` — WhatsApp, menu do celular, animações ao rolar e controle da fachada.
- `entrar.html` + `js/conta.js` — entrar, criar conta, sair, excluir conta.
- `admin.html` + `js/admin.js` — painel: fotos dos vestidos, novidades, clientes.
- `worker.js` — servidor (API, contas, imagens, página inicial com dados do banco).
- `schema.sql` — tabelas do banco D1. `wrangler.jsonc` — configuração da Cloudflare.
- `assets/img/` — fotos da loja otimizadas para a web.
- `assets/fachada-star-moda.svg` — ilustração simples da fachada (versão do protótipo).
