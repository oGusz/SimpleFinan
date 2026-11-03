-- ==============================================================================
-- SimpleFinan — Faturas de cartão importadas pelo Open Finance
-- Execute no Supabase SQL Editor. Pode ser executado mais de uma vez.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.synced_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  pluggy_bill_id TEXT NOT NULL,
  pluggy_account_id TEXT NOT NULL,
  account_name TEXT,
  due_date DATE NOT NULL,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  has_payments BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_bill UNIQUE (user_id, pluggy_bill_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_bills_user_due ON public.synced_bills (user_id, due_date);

ALTER TABLE public.synced_bills ENABLE ROW LEVEL SECURITY;

-- Somente leitura: quem grava é o servidor, depois de validar o dono do banco.
DROP POLICY IF EXISTS "Usuários leem suas faturas" ON public.synced_bills;
CREATE POLICY "Usuários leem suas faturas" ON public.synced_bills
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.synced_bills FROM anon;
