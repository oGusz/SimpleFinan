-- ==============================================================================
-- SimpleFinan — Segunda barreira no banco
-- Execute no Supabase SQL Editor. Pode ser executado mais de uma vez.
--
-- O RLS sozinho já falhou na tabela bills. Sem privilégio para o papel anon, uma política
-- errada no futuro deixa de expor os dados para quem não fez login.
-- ==============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Vale também para as tabelas criadas daqui em diante.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- Evita que a função resolva objetos em outro schema (alerta do Security Advisor).
ALTER FUNCTION public.handle_updated_at() SET search_path = public;

-- Conferência: todas as tabelas devem aparecer com rowsecurity = true.
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
