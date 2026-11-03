-- ==============================================================================
-- SimpleFinan — Migração para arquitetura de produção Open Finance
-- Execute APÓS o migration anterior (schema.sql)
-- ==============================================================================

-- ─── 1. Adicionar campos de status e erro na tabela connected_banks ───────────
ALTER TABLE public.connected_banks
  ADD COLUMN IF NOT EXISTS item_status TEXT NOT NULL DEFAULT 'UPDATED',
  ADD COLUMN IF NOT EXISTS error_type  TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Valores possíveis para item_status:
--   UPDATING       → sincronização em andamento
--   UPDATED        → sincronizado com sucesso
--   ERROR          → erro genérico no banco
--   LOGIN_ERROR    → credenciais expiradas (precisa reconectar)
--   WAITING_USER_INPUT → aguardando MFA do usuário

-- ─── 2. Criar tabela de contas bancárias sincronizadas ─────────────────────────
CREATE TABLE IF NOT EXISTS public.synced_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_account_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  name TEXT,
  type TEXT,         -- BANK / CREDIT
  subtype TEXT,      -- CHECKING, SAVINGS, CREDIT_CARD, etc.
  balance NUMERIC(14, 2) DEFAULT 0,
  credit_limit NUMERIC(14, 2),
  currency_code TEXT DEFAULT 'BRL',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_account UNIQUE (user_id, pluggy_account_id)
);

-- ─── 3. Criar tabela de transações sincronizadas ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.synced_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_transaction_id TEXT NOT NULL,
  pluggy_account_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(14, 2),
  type TEXT,         -- debit / credit
  date DATE,
  category TEXT DEFAULT 'outros',
  balance_after NUMERIC(14, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_transaction UNIQUE (user_id, pluggy_transaction_id)
);

-- ─── 4. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_synced_accounts_user     ON public.synced_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_synced_accounts_item     ON public.synced_accounts (item_id);
CREATE INDEX IF NOT EXISTS idx_synced_transactions_user ON public.synced_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_synced_transactions_account ON public.synced_transactions (pluggy_account_id);
CREATE INDEX IF NOT EXISTS idx_synced_transactions_date ON public.synced_transactions (user_id, date DESC);

-- ─── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.synced_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synced_transactions ENABLE ROW LEVEL SECURITY;

-- Somente leitura: a escrita é do servidor. Rodar este arquivo de novo não pode reabrir as tabelas.
DROP POLICY IF EXISTS "Usuários acessam suas próprias contas sincronizadas" ON public.synced_accounts;
DROP POLICY IF EXISTS "Usuários leem suas contas sincronizadas" ON public.synced_accounts;
CREATE POLICY "Usuários leem suas contas sincronizadas" ON public.synced_accounts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários acessam suas próprias transações" ON public.synced_transactions;
DROP POLICY IF EXISTS "Usuários leem suas transações" ON public.synced_transactions;
CREATE POLICY "Usuários leem suas transações" ON public.synced_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─── 6. Triggers de updated_at ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_synced_accounts_updated_at ON public.synced_accounts;
CREATE TRIGGER set_synced_accounts_updated_at
  BEFORE UPDATE ON public.synced_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── FIM ──────────────────────────────────────────────────────────────────────

