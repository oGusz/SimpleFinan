-- ==============================================================================
-- SimpleFinan — CORREÇÃO URGENTE: a tabela bills estava aberta para a chave pública
-- Execute no Supabase SQL Editor. Pode ser executado mais de uma vez.
-- ==============================================================================

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

-- Uma política permissiva basta para abrir a tabela, e elas se somam.
-- Por isso remove todas, inclusive as criadas pelo painel, em vez de só acrescentar a correta.
DO $$
DECLARE
  policy_name TEXT;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bills'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.bills', policy_name);
  END LOOP;
END;
$$;

CREATE POLICY "Usuários gerenciam suas próprias contas" ON public.bills
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sem login, não há nenhum motivo para acessar esta tabela.
REVOKE ALL ON public.bills FROM anon;

ALTER TABLE public.bills ALTER COLUMN user_id SET NOT NULL;

-- Conferência: deve listar uma única política, para o papel authenticated.
SELECT policyname, roles, cmd, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bills';
