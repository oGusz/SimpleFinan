-- ==============================================================================
-- SimpleFinan — Notícias da CVM, histórico da carteira e alertas de preço
-- Execute no Supabase SQL Editor depois de migration_commercial.sql. Pode ser executado mais de uma vez.
-- Não altera nenhum dado existente: só cria tabelas novas.
--
-- Sem esta migração, notícias, histórico e alertas ficam indisponíveis e o restante do app
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

-- ─── 3. Histórico real da carteira ────────────────────────────────────────────
-- Uma foto por dia de pregão: quantidade e cotação de cada ativo de bolsa. A rentabilidade é
-- calculada sobre as posições do dia anterior, então um aporte novo não aparece como ganho.
-- Gravada pela rotina diária para todos, para que quem assinar já encontre histórico.
CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('manual', 'open_finance')),
  day DATE NOT NULL,
  value NUMERIC(16, 2) NOT NULL CHECK (value >= 0),
  -- { "PETR4": { "q": 10, "p": 46.71 } }
  holdings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source, day)
);

ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários leem seu histórico" ON public.portfolio_snapshots;
CREATE POLICY "Usuários leem seu histórico" ON public.portfolio_snapshots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.portfolio_snapshots FROM anon, authenticated;
GRANT SELECT ON public.portfolio_snapshots TO authenticated;

-- ─── 4. Alertas de preço ──────────────────────────────────────────────────────
-- Criados e apagados só pelo servidor, que confere o plano e o limite por pessoa.
CREATE TABLE IF NOT EXISTS public.price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL CHECK (ticker ~ '^[A-Z]{4}[0-9]{1,2}[A-Z]?$'),
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  target NUMERIC(14, 4) NOT NULL CHECK (target > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_at TIMESTAMPTZ,
  triggered_price NUMERIC(14, 4)
);

CREATE INDEX IF NOT EXISTS price_alerts_user_idx ON public.price_alerts (user_id);
CREATE INDEX IF NOT EXISTS price_alerts_active_idx ON public.price_alerts (ticker) WHERE triggered_at IS NULL;

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários leem seus alertas" ON public.price_alerts;
CREATE POLICY "Usuários leem seus alertas" ON public.price_alerts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.price_alerts FROM anon, authenticated;
GRANT SELECT ON public.price_alerts TO authenticated;

COMMIT;
