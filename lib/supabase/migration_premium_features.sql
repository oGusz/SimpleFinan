-- ==============================================================================
-- SimpleFinan — Notícias da CVM e radar de proventos
-- Execute no Supabase SQL Editor depois de migration_commercial.sql. Pode ser executado mais de uma vez.
-- Não altera nenhum dado existente: só cria tabelas novas.
--
-- Sem esta migração, a aba de notícias mostra que ainda não há comunicados e o restante do app
-- continua funcionando.
-- ==============================================================================

BEGIN;

-- ─── 1. Código de negociação de cada empresa ─────────────────────────────────
-- A CVM identifica as empresas pelo CNPJ; o app conhece só o código (PETR4). Vem do formulário
-- cadastral (FCA) que a própria CVM publica, e é reescrito pela rotina diária.
CREATE TABLE IF NOT EXISTS public.market_tickers (
  ticker TEXT PRIMARY KEY,
  cnpj TEXT NOT NULL,
  company TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_tickers_cnpj_idx ON public.market_tickers (cnpj);

-- ─── 2. Comunicados oficiais ──────────────────────────────────────────────────
-- Fatos relevantes, comunicados ao mercado e avisos aos acionistas (proventos), com o link do
-- documento na CVM. O texto do documento não é copiado: o app mostra o assunto e abre o original.
CREATE TABLE IF NOT EXISTS public.market_announcements (
  protocol TEXT PRIMARY KEY,
  cnpj TEXT NOT NULL,
  company TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  reference_date DATE,
  delivered_on DATE NOT NULL,
  url TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_announcements_cnpj_date_idx
  ON public.market_announcements (cnpj, delivered_on DESC);

-- São dados públicos da CVM: qualquer pessoa logada pode ler. Só o servidor grava.
ALTER TABLE public.market_tickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários leem códigos de negociação" ON public.market_tickers;
CREATE POLICY "Usuários leem códigos de negociação" ON public.market_tickers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuários leem comunicados" ON public.market_announcements;
CREATE POLICY "Usuários leem comunicados" ON public.market_announcements
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.market_tickers FROM anon, authenticated;
REVOKE ALL ON public.market_announcements FROM anon, authenticated;
GRANT SELECT ON public.market_tickers TO authenticated;
GRANT SELECT ON public.market_announcements TO authenticated;

COMMIT;
