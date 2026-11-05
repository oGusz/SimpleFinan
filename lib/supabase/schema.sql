-- ==============================================================================
-- SimpleFinan — Script de MIGRAÇÃO (seguro para rodar em banco já existente)
-- Execute este arquivo no Supabase SQL Editor
-- Usa IF NOT EXISTS e ADD COLUMN IF NOT EXISTS para não quebrar nada
--
-- Este arquivo NÃO recria as tabelas base: bills, goals e investments não têm CREATE TABLE
-- em nenhum SQL do repositório, e ele falha em um banco vazio. Para reconstruir o banco, o
-- baseline depende de exportar o esquema real com 'supabase db pull'.
-- ==============================================================================

-- ─── 1. MIGRAR TABELA bills (adicionar colunas que podem estar faltando) ──────
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'outros',
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- ─── 2. MIGRAR TABELA goals (adicionar colunas que podem estar faltando) ──────
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS monthly_contribution NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deadline DATE,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- ─── 3. MIGRAR TABELA investments (adicionar colunas que podem estar faltando) ─
ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price NUMERIC(12, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_price NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS dividend_yield NUMERIC(6, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'FII',
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'FII',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

UPDATE public.investments SET source = 'manual' WHERE source IS NULL;

ALTER TABLE public.investments DROP CONSTRAINT IF EXISTS unique_user_ticker;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_source_ticker'
  ) THEN
    ALTER TABLE public.investments
      ADD CONSTRAINT unique_user_source_ticker UNIQUE (user_id, source, ticker);
  END IF;
END $$;

-- ─── 4. CRIAR TABELA connected_banks (nova) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.connected_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'pluggy',
  institution_name TEXT,
  institution_logo TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  item_status TEXT NOT NULL DEFAULT 'UPDATED',
  error_type TEXT,
  error_message TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_item UNIQUE (user_id, item_id)
);

ALTER TABLE public.connected_banks
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'pluggy',
  ADD COLUMN IF NOT EXISTS item_status TEXT NOT NULL DEFAULT 'UPDATED',
  ADD COLUMN IF NOT EXISTS error_type TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ─── Tabela de contas importadas pelo Open Finance ──────────────────────────
CREATE TABLE IF NOT EXISTS public.synced_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_account_id TEXT NOT NULL,
  item_id TEXT,
  name TEXT,
  type TEXT,
  subtype TEXT,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(14, 2),
  currency_code TEXT DEFAULT 'BRL',
  last_synced_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_pluggy_account UNIQUE (user_id, pluggy_account_id)
);

ALTER TABLE public.synced_accounts ENABLE ROW LEVEL SECURITY;
-- Somente leitura: a escrita é do servidor. Rodar este arquivo de novo não pode reabrir a tabela.
DROP POLICY IF EXISTS "Usuários gerenciam suas próprias contas sincronizadas" ON public.synced_accounts;
DROP POLICY IF EXISTS "Usuários leem suas contas sincronizadas" ON public.synced_accounts;
CREATE POLICY "Usuários leem suas contas sincronizadas" ON public.synced_accounts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_synced_accounts_user_id ON public.synced_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_synced_accounts_item_id ON public.synced_accounts (item_id);

-- ─── 5. ÍNDICES (todos com IF NOT EXISTS) ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bills_user_due_date   ON public.bills (user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_bills_user_paid        ON public.bills (user_id, paid);
CREATE INDEX IF NOT EXISTS idx_goals_user_id          ON public.goals (user_id);
CREATE INDEX IF NOT EXISTS idx_investments_user_id    ON public.investments (user_id);
-- Índice de ticker só criado se a coluna existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'investments'
      AND column_name = 'ticker'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_investments_ticker ON public.investments (ticker);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_connected_banks_user_id ON public.connected_banks (user_id);

-- ─── 6. ATIVAR RLS EM TODAS AS TABELAS ───────────────────────────────────────
ALTER TABLE public.bills           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_banks ENABLE ROW LEVEL SECURITY;

-- ─── 7. POLÍTICAS RLS (DROP + CREATE para garantir atualização) ──────────────
DROP POLICY IF EXISTS "Usuários gerenciam suas próprias contas"       ON public.bills;
CREATE POLICY "Usuários gerenciam suas próprias contas" ON public.bills
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários gerenciam suas próprias metas"        ON public.goals;
CREATE POLICY "Usuários gerenciam suas próprias metas" ON public.goals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários gerenciam seus próprios investimentos" ON public.investments;
CREATE POLICY "Usuários gerenciam seus próprios investimentos" ON public.investments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Somente leitura: gravar aqui permitiria registrar o item_id de outra pessoa.
DROP POLICY IF EXISTS "Usuários gerenciam seus bancos conectados"      ON public.connected_banks;
DROP POLICY IF EXISTS "Usuários leem seus bancos conectados"           ON public.connected_banks;
CREATE POLICY "Usuários leem seus bancos conectados" ON public.connected_banks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─── 8. FUNÇÃO E TRIGGERS DE updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_bills_updated_at         ON public.bills;
CREATE TRIGGER set_bills_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_goals_updated_at         ON public.goals;
CREATE TRIGGER set_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_investments_updated_at   ON public.investments;
CREATE TRIGGER set_investments_updated_at
  BEFORE UPDATE ON public.investments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_connected_banks_updated_at ON public.connected_banks;
CREATE TRIGGER set_connected_banks_updated_at
  BEFORE UPDATE ON public.connected_banks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── FIM DA MIGRAÇÃO ─────────────────────────────────────────────────────────
-- Se tudo correu bem, você verá "DO" ou "ALTER TABLE" sem erros acima.

