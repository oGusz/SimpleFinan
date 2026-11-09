-- Gamificação: conquistas (selos) e desafio do mês.
-- Pode rodar de novo sem problema: só cria o que ainda não existe.
-- Gravação só pelo servidor (service role), que confere as regras; cada pessoa só lê o que é seu.

BEGIN;

-- ─── 1. Conquistas ────────────────────────────────────────────────────────────
-- Um selo destravado é permanente: apagar a conta ou a meta depois não tira os pontos.
-- Os pontos ficam gravados no desbloqueio, para uma mudança futura na tabela de pontos não mexer no passado.
CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[a-z0-9_]{1,40}$'),
  points INTEGER NOT NULL CHECK (points >= 0),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Nulo até o app mostrar o aviso da conquista.
  seen_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, code)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários leem suas conquistas" ON public.user_achievements;
CREATE POLICY "Usuários leem suas conquistas" ON public.user_achievements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.user_achievements FROM anon, authenticated;
GRANT SELECT ON public.user_achievements TO authenticated;

-- ─── 2. Desafio do mês ────────────────────────────────────────────────────────
-- Uma linha por pessoa e mês. O baseline guarda o ponto de partida do desafio (ex.: quanto já
-- havia nas metas), e completed_at só é gravado uma vez.
CREATE TABLE IF NOT EXISTS public.user_challenges (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  code TEXT NOT NULL CHECK (code ~ '^[a-z0-9_]{1,40}$'),
  baseline JSONB NOT NULL DEFAULT '{}'::jsonb,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  completed_at TIMESTAMPTZ,
  seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month)
);

ALTER TABLE public.user_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários leem seus desafios" ON public.user_challenges;
CREATE POLICY "Usuários leem seus desafios" ON public.user_challenges
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.user_challenges FROM anon, authenticated;
GRANT SELECT ON public.user_challenges TO authenticated;

COMMIT;
