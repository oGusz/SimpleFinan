-- ==============================================================================
-- SimpleFinan — Preço médio, metas por ativo, faturas, contas puladas e push
-- Execute no Supabase SQL Editor APÓS as demais migrações. Pode ser executado mais de uma vez.
-- Tudo ocorre em uma transação: se um comando falhar, nada é aplicado.
--
-- O app funciona sem esta migração, mas sem os recursos abaixo.
-- A seção 5 altera dados de usuários: leia antes de executar.
-- ==============================================================================

BEGIN;

-- ─── 1. Investimentos ─────────────────────────────────────────────────────────
-- avg_price é o custo informado pelo usuário ou pela Pluggy; price continua sendo a cotação.
-- item_id identifica o banco de origem, para apagar os ativos ao desconectar. Fica nulo no
-- modo manual e nas linhas antigas do Open Finance até a próxima sincronização.
ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS avg_price NUMERIC,
  ADD COLUMN IF NOT EXISTS target_percent NUMERIC(5, 2)
    CONSTRAINT investments_target_percent_range
    CHECK (target_percent IS NULL OR target_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS item_id TEXT;

-- Sem provento conhecido, o valor é nulo. schema.sql já definiu este padrão como 10%.
ALTER TABLE public.investments ALTER COLUMN dividend_yield SET DEFAULT NULL;
ALTER TABLE public.investments ALTER COLUMN dividend_yield DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_investments_user_source_item
  ON public.investments (user_id, source, item_id);

-- ─── 2. Faturas de cartão ─────────────────────────────────────────────────────
-- Os pagamentos da fatura N aparecem na fatura N+1, então has_payments não diz se a própria
-- fatura foi paga. Os totais permitem comparar o que foi pago com o que era devido.
-- Ficam nulos até a próxima sincronização do banco.
ALTER TABLE public.synced_bills
  ADD COLUMN IF NOT EXISTS payments_total NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS finance_charges_total NUMERIC(14, 2);

-- ─── 3. Contas recorrentes puladas ────────────────────────────────────────────
-- Registra "excluir só este mês". Sem isto, a conta recorrente é recriada ao abrir o mês.
-- Tabela à parte, e não um novo status em bills, porque vários pontos do app tratam
-- como pendente tudo o que não está pago.
CREATE TABLE IF NOT EXISTS public.bill_skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_key TEXT NOT NULL,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), -- 'YYYY-MM'
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_bill_skip UNIQUE (user_id, title_key, month)
);

ALTER TABLE public.bill_skips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários leem suas contas puladas" ON public.bill_skips;
CREATE POLICY "Usuários leem suas contas puladas" ON public.bill_skips
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários registram suas contas puladas" ON public.bill_skips;
CREATE POLICY "Usuários registram suas contas puladas" ON public.bill_skips
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários removem suas contas puladas" ON public.bill_skips;
CREATE POLICY "Usuários removem suas contas puladas" ON public.bill_skips
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Privilégios explícitos: não dependem do padrão do projeto para tabelas novas.
REVOKE ALL ON public.bill_skips FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.bill_skips TO authenticated;
GRANT ALL ON public.bill_skips TO service_role;

-- ─── 4. Tokens de notificação push ────────────────────────────────────────────
-- Somente leitura e exclusão para o usuário: a gravação é do servidor, depois de validar o
-- token. Se o usuário gravasse direto, poderia cadastrar o aparelho de outra pessoa para
-- receber os avisos dele.
CREATE TABLE IF NOT EXISTS public.push_tokens (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, token)
);

-- A chave começa por user_id. Este índice localiza o token quando o aparelho troca de conta
-- ou quando o serviço de push avisa que ele deixou de valer.
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON public.push_tokens (token);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários leem seus tokens de push" ON public.push_tokens;
CREATE POLICY "Usuários leem seus tokens de push" ON public.push_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários removem seus tokens de push" ON public.push_tokens;
CREATE POLICY "Usuários removem seus tokens de push" ON public.push_tokens
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.push_tokens FROM anon, authenticated;
GRANT SELECT, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;

DROP TRIGGER IF EXISTS set_push_tokens_updated_at ON public.push_tokens;
CREATE TRIGGER set_push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 5. Limpeza de dados — REVISE ANTES DE EXECUTAR ───────────────────────────
-- Estes comandos ALTERAM DADOS DE USUÁRIOS e não têm como ser desfeitos depois do COMMIT.
-- Para ver quantas linhas serão afetadas, rode antes a consulta 4 de audit_rls.sql.
-- Para adiar a limpeza, comente os dois UPDATE abaixo: o restante da migração não depende deles.

-- No Open Finance, avg_price recebia o preço atual, o que daria rentabilidade de 0% falsa.
-- O filtro em item_id preserva o custo real já importado se este arquivo for executado de novo:
-- só as linhas gravadas pela versão antiga do app têm item_id nulo.
UPDATE public.investments
  SET avg_price = NULL
  WHERE source = 'open_finance'
    AND item_id IS NULL
    AND avg_price IS NOT NULL;

-- Nenhum fluxo do app permite informar este valor: o que está gravado é o 10% antigo ou o 0
-- deixado por migration_growth.sql. Os proventos passam a vir de consulta ao mercado.
UPDATE public.investments
  SET dividend_yield = NULL
  WHERE dividend_yield IS NOT NULL;

COMMIT;

-- ─── 6. Opcional: reclassificar categorias dos ativos manuais ─────────────────
-- ALTERA DADOS DE PRODUÇÃO. Não faz parte da migração: fica para o dono rodar depois de revisar.
-- O app gravava 'FII' em todo ativo sem categoria, inclusive em ações e BDRs. A tela já corrige
-- isso na exibição; este bloco só deixa a correção gravada no banco. Categorias escolhidas pelo
-- usuário não são tocadas.
--
-- Para conferir antes:
--
-- SELECT ticker, category, count(*) AS linhas
-- FROM public.investments
-- WHERE source = 'manual'
--   AND (category IS NULL OR category IN ('FII', 'Tijolo'))
--   AND ticker ~ '^[A-Z]{4}([3-6]|3[45])$'
-- GROUP BY ticker, category
-- ORDER BY ticker;
--
-- Para aplicar, descomente:
--
-- BEGIN;
--
-- UPDATE public.investments
--   SET category = 'Ações'
--   WHERE source = 'manual'
--     AND (category IS NULL OR category IN ('FII', 'Tijolo'))
--     AND ticker ~ '^[A-Z]{4}[3-6]$';
--
-- UPDATE public.investments
--   SET category = 'BDRs'
--   WHERE source = 'manual'
--     AND (category IS NULL OR category IN ('FII', 'Tijolo'))
--     AND ticker ~ '^[A-Z]{4}3[45]$';
--
-- COMMIT;

-- Conferência: deve listar as cinco colunas novas, e as duas tabelas com rowsecurity = true.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'investments' AND column_name IN ('avg_price', 'target_percent', 'item_id'))
    OR (table_name = 'synced_bills' AND column_name IN ('payments_total', 'finance_charges_total'))
  )
ORDER BY table_name, column_name;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('bill_skips', 'push_tokens')
ORDER BY tablename;
