-- ==============================================================================
-- SimpleFinan — Teste grátis, lembretes, limite de tentativas e dados reais
-- Execute no Supabase SQL Editor APÓS migration_premium.sql. Pode ser executado mais de uma vez.
-- ==============================================================================

-- ─── 1. Teste grátis ──────────────────────────────────────────────────────────
-- A linha em subscriptions fica registrada depois de expirar: é ela que impede um segundo teste.
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_provider_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_provider_check
  CHECK (provider IN ('manual', 'revenuecat', 'trial'));

-- ─── 2. Extrato ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_synced_transactions_user_date
  ON public.synced_transactions (user_id, date DESC);

-- ─── 3. Lembretes por e-mail ──────────────────────────────────────────────────
-- Impede que a mesma conta ou o mesmo resumo sejam enviados duas vezes.
CREATE TABLE IF NOT EXISTS public.notification_log (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, ref)
);
-- RLS ligado e sem políticas: só o servidor (service role) acessa.
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- ─── 4. Limite de tentativas de login e cadastro ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Atômica: duas requisições simultâneas não conseguem furar o limite.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key TEXT, p_max INTEGER, p_window_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_attempts INTEGER;
BEGIN
  INSERT INTO public.rate_limits AS limits (key, attempts, window_start)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    attempts = CASE
      WHEN limits.window_start < now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE limits.attempts + 1
    END,
    window_start = CASE
      WHEN limits.window_start < now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE limits.window_start
    END
  RETURNING attempts INTO current_attempts;

  RETURN current_attempts <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- ─── 5. Remover o rendimento inventado ────────────────────────────────────────
-- O app gravava 10% de dividend yield em todo ativo; a interface nunca permitiu informar esse valor.
ALTER TABLE public.investments ALTER COLUMN dividend_yield DROP DEFAULT;
UPDATE public.investments SET dividend_yield = 0 WHERE dividend_yield = 10;
