-- ==============================================================================
-- SimpleFinan — Planos Free/Premium e endurecimento de segurança
-- Execute no Supabase SQL Editor APÓS schema.sql. Pode ser executado mais de uma vez.
-- ==============================================================================

-- ─── 1. Assinaturas ───────────────────────────────────────────────────────────
-- Fonte de verdade do plano. O usuário só pode LER a própria linha: a escrita é
-- feita pelo servidor (service role). Nunca use user_metadata para isso, pois o
-- próprio usuário consegue alterá-lo pela API pública.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'premium' CHECK (plan IN ('free', 'premium')),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'billing_issue', 'expired')),
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'revenuecat')),
  product_id TEXT,
  store TEXT,
  current_period_end TIMESTAMPTZ, -- NULL = sem expiração (concessão manual)
  last_event_at TIMESTAMPTZ,      -- descarta webhooks fora de ordem
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários leem a própria assinatura" ON public.subscriptions;
CREATE POLICY "Usuários leem a própria assinatura" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 2. Dados de Open Finance: somente leitura para o usuário ─────────────────
-- Sem isto, qualquer usuário poderia gravar o item_id de outra pessoa direto pela
-- API do Supabase. A escrita passa a ser exclusiva do servidor, após validar o dono.
CREATE TABLE IF NOT EXISTS public.synced_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_transaction_id TEXT NOT NULL,
  pluggy_account_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(14, 2),
  type TEXT,
  date DATE,
  category TEXT DEFAULT 'outros',
  balance_after NUMERIC(14, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_transaction UNIQUE (user_id, pluggy_transaction_id)
);
ALTER TABLE public.synced_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários gerenciam seus bancos conectados" ON public.connected_banks;
DROP POLICY IF EXISTS "Usuários leem seus bancos conectados" ON public.connected_banks;
CREATE POLICY "Usuários leem seus bancos conectados" ON public.connected_banks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários gerenciam suas próprias contas sincronizadas" ON public.synced_accounts;
DROP POLICY IF EXISTS "Usuários acessam suas próprias contas sincronizadas" ON public.synced_accounts;
DROP POLICY IF EXISTS "Usuários leem suas contas sincronizadas" ON public.synced_accounts;
CREATE POLICY "Usuários leem suas contas sincronizadas" ON public.synced_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários acessam suas próprias transações" ON public.synced_transactions;
DROP POLICY IF EXISTS "Usuários leem suas transações" ON public.synced_transactions;
CREATE POLICY "Usuários leem suas transações" ON public.synced_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Um item da Pluggy pertence a uma única pessoa (o webhook depende disso).
-- Se este comando falhar, existem duplicatas: remova-as e execute novamente.
CREATE UNIQUE INDEX IF NOT EXISTS unique_connected_banks_item_id
  ON public.connected_banks (item_id);

-- ─── 3. Investimentos: manual e Open Finance podem ter o mesmo ticker ─────────
-- Versões antigas de schema.sql criavam unique_user_ticker, o que quebra a importação
-- de um ticker já cadastrado manualmente. A regra válida é unique_user_source_ticker.
ALTER TABLE public.investments DROP CONSTRAINT IF EXISTS unique_user_ticker;

-- ─── 4. Fotos de perfil ───────────────────────────────────────────────────────
-- A foto ia em base64 para o user_metadata, que entra no JWT e no cookie de sessão.
-- Uma imagem grande estoura o limite de cabeçalhos e impede o usuário de entrar.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Usuários listam o próprio avatar" ON storage.objects;
CREATE POLICY "Usuários listam o próprio avatar" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Usuários enviam o próprio avatar" ON storage.objects;
CREATE POLICY "Usuários enviam o próprio avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Usuários removem o próprio avatar" ON storage.objects;
CREATE POLICY "Usuários removem o próprio avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── 5. Liberar o Premium para a sua conta (uso pessoal) ──────────────────────
-- Também serve para a conta de demonstração exigida na revisão das lojas.
-- Descomente, troque o e-mail e execute:
--
-- INSERT INTO public.subscriptions (user_id, plan, status, provider)
-- SELECT id, 'premium', 'active', 'manual' FROM auth.users WHERE email = 'seu@email.com'
-- ON CONFLICT (user_id) DO UPDATE
--   SET plan = 'premium', status = 'active', provider = 'manual', current_period_end = NULL;
