-- ==============================================================================
-- SimpleFinan — Auditoria de RLS e dos padrões de investments
-- Somente leitura: nenhuma consulta abaixo altera o banco.
--
-- O SQL Editor mostra apenas o resultado da última consulta. Selecione e execute uma por vez.
--
-- O QUE PROCURAR: qualquer política que não use auth.uid() = user_id.
-- Uma única política permissiva basta para abrir a tabela, porque elas se somam. Foi assim que
-- bills ficou exposta, por uma política criada no painel (migration_fix_bills_rls.sql).
-- Por isso esta consulta olha o que existe no banco, e não os nomes conhecidos.
--
-- O QUE É ESPERADO:
-- - bills, goals, investments: uma política FOR ALL, para authenticated.
-- - synced_accounts, synced_transactions, synced_bills, connected_banks, subscriptions:
--   só SELECT, de propósito. A escrita é do servidor. Não crie política de escrita nelas.
-- - bill_skips: SELECT, INSERT e DELETE. push_tokens: SELECT e DELETE.
-- - notification_log, rate_limits: RLS ligado e nenhuma política, de propósito.
-- - storage.objects: não tem user_id. As do bucket avatars comparam a pasta com auth.uid()::text.
--
-- Remova uma política só depois de entender o resultado: um DROP errado tira o acesso do app.
-- ==============================================================================

-- ─── 1. Políticas de public e de storage.objects ──────────────────────────────
-- A coluna "avaliacao" é um atalho: confira também quem aparece como OK. Parênteses e espaços
-- são removidos porque o Postgres reescreve a expressão ao salvar a política.
WITH politicas AS (
  SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check,
    regexp_replace(qual, '[()\s]', '', 'g') AS qual_limpo,
    regexp_replace(with_check, '[()\s]', '', 'g') AS check_limpo
  FROM pg_policies
  WHERE schemaname = 'public'
     OR (schemaname = 'storage' AND tablename = 'objects')
),
donos (expressao) AS (
  VALUES
    ('auth.uid=user_id'),
    ('user_id=auth.uid'),
    ('SELECTauth.uidASuid=user_id'),
    ('user_id=SELECTauth.uidASuid')
)
SELECT
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check,
  permissive,
  CASE
    WHEN 'anon' = ANY (roles) OR 'public' = ANY (roles)
      THEN 'REVISAR: vale para quem não fez login'
    WHEN schemaname = 'storage'
      THEN 'CONFERIR: deve limitar ao bucket e à pasta do próprio usuário'
    WHEN tablename IN ('synced_accounts', 'synced_transactions', 'synced_bills', 'connected_banks', 'subscriptions')
         AND cmd <> 'SELECT'
      THEN 'REVISAR: a escrita nesta tabela é só do servidor'
    WHEN tablename = 'push_tokens' AND cmd NOT IN ('SELECT', 'DELETE')
      THEN 'REVISAR: a gravação nesta tabela é só do servidor'
    WHEN cmd = 'INSERT' AND with_check IS NULL
      THEN 'REVISAR: INSERT sem WITH CHECK'
    WHEN qual_limpo IS NOT NULL AND qual_limpo NOT IN (SELECT expressao FROM donos)
      THEN 'REVISAR: USING não é auth.uid() = user_id'
    WHEN check_limpo IS NOT NULL AND check_limpo NOT IN (SELECT expressao FROM donos)
      THEN 'REVISAR: WITH CHECK não é auth.uid() = user_id'
    ELSE 'OK'
  END AS avaliacao
FROM politicas
ORDER BY (schemaname = 'storage'), tablename, policyname;

-- ─── 2. Tabelas com RLS ligado ────────────────────────────────────────────────
-- Todas devem ter rowsecurity = true. Com zero políticas, só o servidor acessa.
SELECT
  t.schemaname,
  t.tablename,
  t.rowsecurity,
  count(p.policyname) AS politicas
FROM pg_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
   OR (t.schemaname = 'storage' AND t.tablename = 'objects')
GROUP BY t.schemaname, t.tablename, t.rowsecurity
ORDER BY t.rowsecurity, t.schemaname, t.tablename;

-- ─── 3. Padrão real de dividend_yield e existência de avg_price ───────────────
-- dividend_yield deve ter column_default vazio (ou NULL) e is_nullable = YES. Um padrão de 10
-- significa que o banco ainda inventa rendimento para todo ativo novo.
-- Se avg_price não aparecer, migration_commercial.sql ainda não foi aplicada neste banco.
SELECT column_name, data_type, numeric_precision, numeric_scale, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'investments'
  AND column_name IN ('dividend_yield', 'avg_price')
ORDER BY column_name;

-- ─── 4. Linhas que a limpeza de migration_commercial.sql vai alterar ──────────
-- Só totais por origem, sem dados de nenhum usuário. dy_preenchidas é o que seria anulado em
-- dividend_yield. Em avg_price, a limpeza alcança as linhas da origem open_finance.
SELECT
  source,
  count(*) AS linhas,
  count(dividend_yield) AS dy_preenchidas,
  count(*) FILTER (WHERE dividend_yield = 10) AS dy_igual_a_10,
  count(*) FILTER (WHERE dividend_yield = 0) AS dy_igual_a_0
FROM public.investments
GROUP BY source
ORDER BY source;

-- ─── 5. Privilégios do papel anon ─────────────────────────────────────────────
-- Deve voltar vazio (migration_harden.sql). Com linha aqui, uma política errada expõe a tabela
-- para quem não fez login.
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;
