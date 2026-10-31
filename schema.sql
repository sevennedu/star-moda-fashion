-- Banco D1 da Star Moda Fashion.
-- Aplicar: npx wrangler d1 execute star-moda-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefone TEXT NOT NULL DEFAULT '',
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'cliente' CHECK (papel IN ('cliente', 'admin')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);

-- Produtos da seção "Novidades". Sem preço por enquanto (coluna pronta para depois).
CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  imagem TEXT NOT NULL,
  preco TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fotos de vestidos do site trocadas pelo admin (chave = data-img no index.html).
CREATE TABLE IF NOT EXISTS imagens (
  chave TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT ''
);
