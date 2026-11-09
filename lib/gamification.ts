// Gamificação: conquistas, níveis e desafio do mês. Funções puras; o servidor busca os dados.
// Só premia hábitos de organização (contas, metas, registros), nunca operação ou ativo específico.
import { isSettledBill } from '@/lib/finance-insights'

export interface GamificationStats {
  billsTotal: number
  billsPaid: number
  /** Meses já fechados, nos últimos 12, com pelo menos uma conta e todas pagas. */
  closedMonthsAllPaid: number
  goalsTotal: number
  goalsWithFunds: number
  goalsHalfway: number
  goalsCompleted: number
  investmentsTotal: number
  banksConnected: number
  snapshotDays: number
  priceAlerts: number
  challengesCompleted: number
  isPremium: boolean
}

export interface Progress {
  current: number
  target: number
}

export interface AchievementDef {
  code: string
  title: string
  description: string
  /** Como destravar, mostrado enquanto o selo está bloqueado. */
  hint: string
  points: number
  /** Nome do ícone do lucide-react. */
  icon: string
  /** Ligado a um recurso Premium: só aparece para quem assina ou já destravou. */
  premiumFeature?: boolean
  unlocked: (stats: GamificationStats) => boolean
  progress?: (stats: GamificationStats) => Progress
}

const counter = (target: number, read: (stats: GamificationStats) => number) => ({
  unlocked: (stats: GamificationStats) => read(stats) >= target,
  progress: (stats: GamificationStats) => ({ current: Math.min(read(stats), target), target }),
})

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    code: 'primeira_conta',
    title: 'Primeira conta',
    description: 'Cadastrou a primeira conta a pagar.',
    hint: 'Cadastre uma conta a pagar.',
    points: 10,
    icon: 'ReceiptText',
    unlocked: (stats) => stats.billsTotal >= 1,
  },
  {
    code: 'primeira_paga',
    title: 'Conta paga',
    description: 'Marcou a primeira conta como paga.',
    hint: 'Marque uma conta como paga.',
    points: 10,
    icon: 'CircleCheck',
    unlocked: (stats) => stats.billsPaid >= 1,
  },
  {
    code: 'dez_pagas',
    title: '10 contas pagas',
    description: 'Marcou 10 contas como pagas no app.',
    hint: 'Marque 10 contas como pagas.',
    points: 20,
    icon: 'ListChecks',
    ...counter(10, (stats) => stats.billsPaid),
  },
  {
    code: 'cinquenta_pagas',
    title: 'Contas em ordem',
    description: 'Marcou 50 contas como pagas no app.',
    hint: 'Marque 50 contas como pagas.',
    points: 50,
    icon: 'BadgeCheck',
    ...counter(50, (stats) => stats.billsPaid),
  },
  {
    code: 'mes_em_dia',
    title: 'Mês em dia',
    description: 'Fechou um mês com todas as contas pagas.',
    hint: 'Pague todas as contas de um mês até ele terminar.',
    points: 30,
    icon: 'CalendarCheck',
    unlocked: (stats) => stats.closedMonthsAllPaid >= 1,
  },
  {
    code: 'tres_meses_em_dia',
    title: 'Trimestre em dia',
    description: 'Fechou 3 meses com todas as contas pagas.',
    hint: 'Feche 3 meses com todas as contas pagas.',
    points: 60,
    icon: 'CalendarRange',
    ...counter(3, (stats) => stats.closedMonthsAllPaid),
  },
  {
    code: 'seis_meses_em_dia',
    title: 'Semestre em dia',
    description: 'Fechou 6 meses com todas as contas pagas.',
    hint: 'Feche 6 meses com todas as contas pagas.',
    points: 100,
    icon: 'CalendarHeart',
    ...counter(6, (stats) => stats.closedMonthsAllPaid),
  },
  {
    code: 'primeira_meta',
    title: 'Primeira meta',
    description: 'Criou uma meta financeira.',
    hint: 'Crie uma meta, como uma reserva ou uma viagem.',
    points: 10,
    icon: 'Target',
    unlocked: (stats) => stats.goalsTotal >= 1,
  },
  {
    code: 'primeiro_deposito',
    title: 'Primeiro passo',
    description: 'Guardou dinheiro em uma meta.',
    hint: 'Guarde algum valor em uma meta.',
    points: 15,
    icon: 'PiggyBank',
    unlocked: (stats) => stats.goalsWithFunds >= 1,
  },
  {
    code: 'meio_caminho',
    title: 'Meio caminho',
    description: 'Chegou à metade de uma meta.',
    hint: 'Chegue a 50% de uma meta.',
    points: 25,
    icon: 'Milestone',
    unlocked: (stats) => stats.goalsHalfway >= 1,
  },
  {
    code: 'meta_concluida',
    title: 'Meta batida',
    description: 'Concluiu uma meta.',
    hint: 'Chegue a 100% de uma meta.',
    points: 50,
    icon: 'Trophy',
    unlocked: (stats) => stats.goalsCompleted >= 1,
  },
  {
    code: 'carteira',
    title: 'Carteira no app',
    description: 'Cadastrou um investimento ou conectou um banco.',
    hint: 'Cadastre um investimento ou conecte um banco.',
    points: 15,
    icon: 'Wallet',
    unlocked: (stats) => stats.investmentsTotal >= 1 || stats.banksConnected >= 1,
  },
  {
    code: 'historico_30',
    title: '30 pregões',
    description: 'Sua carteira tem 30 dias de histórico registrado.',
    hint: 'Mantenha a carteira no app: o histórico é registrado a cada pregão.',
    points: 30,
    icon: 'History',
    ...counter(30, (stats) => stats.snapshotDays),
  },
  {
    code: 'primeiro_alerta',
    title: 'De olho',
    description: 'Criou um alerta de preço.',
    hint: 'Crie um alerta de preço em Alertas.',
    points: 10,
    icon: 'BellRing',
    premiumFeature: true,
    unlocked: (stats) => stats.priceAlerts >= 1,
  },
  {
    code: 'primeiro_desafio',
    title: 'Desafiante',
    description: 'Concluiu um desafio do mês.',
    hint: 'Conclua o desafio do mês.',
    points: 20,
    icon: 'Flag',
    unlocked: (stats) => stats.challengesCompleted >= 1,
  },
  {
    code: 'tres_desafios',
    title: 'Constância',
    description: 'Concluiu 3 desafios do mês.',
    hint: 'Conclua 3 desafios do mês.',
    points: 40,
    icon: 'Medal',
    ...counter(3, (stats) => stats.challengesCompleted),
  },
]

export const LEVELS = [
  { name: 'Iniciante', min: 0 },
  { name: 'Organizado', min: 50 },
  { name: 'Disciplinado', min: 150 },
  { name: 'Planejador', min: 300 },
  { name: 'Estrategista', min: 500 },
  { name: 'Mestre das finanças', min: 800 },
] as const

export interface LevelInfo {
  /** Começa em 1. */
  index: number
  name: string
  min: number
  nextName: string | null
  nextMin: number | null
  /** Progresso até o próximo nível, de 0 a 100 (100 no último). */
  pct: number
}

export function levelFor(points: number): LevelInfo {
  const safe = Math.max(0, Math.floor(Number(points) || 0))
  let position = 0
  for (let i = 0; i < LEVELS.length; i += 1) if (safe >= LEVELS[i].min) position = i
  const level = LEVELS[position]
  const next = LEVELS[position + 1] ?? null
  return {
    index: position + 1,
    name: level.name,
    min: level.min,
    nextName: next?.name ?? null,
    nextMin: next?.min ?? null,
    pct: next ? Math.min(100, ((safe - level.min) / (next.min - level.min)) * 100) : 100,
  }
}

// ─── Desafio do mês ──────────────────────────────────────────────────────────

export const CHALLENGE_POINTS = 40
export const SAVE_CHALLENGE_TARGET = 100

export interface ChallengeInput {
  /** Contas com vencimento no mês do desafio. */
  bills: { total: number; paid: number; categorized: number }
  goalsCount: number
  /** Soma do que está guardado nas metas agora. */
  goalsBalance: number
  /** Soma guardada nas metas quando o desafio do mês começou para a pessoa. */
  baseline: number | null
}

export interface ChallengeResult extends Progress {
  done: boolean
  applicable: boolean
  hint?: string
}

export interface ChallengeDef {
  code: string
  title: string
  description: string
  /** Em reais: a tela formata como dinheiro. */
  money?: boolean
  evaluate: (input: ChallengeInput) => ChallengeResult
}

export const CHALLENGES: ChallengeDef[] = [
  {
    code: 'mes_em_dia_desafio',
    title: 'Mês em dia',
    description: 'Pague todas as contas que vencem neste mês.',
    evaluate: ({ bills }) => {
      if (bills.total === 0) return { current: 0, target: 0, done: false, applicable: false, hint: 'Cadastre as contas deste mês para participar.' }
      return { current: bills.paid, target: bills.total, done: bills.paid >= bills.total, applicable: true }
    },
  },
  {
    code: 'reforce_metas',
    title: 'Reforce suas metas',
    description: `Guarde pelo menos R$ ${SAVE_CHALLENGE_TARGET} nas suas metas neste mês.`,
    money: true,
    evaluate: ({ goalsCount, goalsBalance, baseline }) => {
      if (goalsCount === 0) {
        return { current: 0, target: SAVE_CHALLENGE_TARGET, done: false, applicable: false, hint: 'Crie uma meta para participar.' }
      }
      const saved = Math.max(0, Math.round((goalsBalance - (baseline ?? goalsBalance)) * 100) / 100)
      return { current: Math.min(saved, SAVE_CHALLENGE_TARGET), target: SAVE_CHALLENGE_TARGET, done: saved >= SAVE_CHALLENGE_TARGET, applicable: true }
    },
  },
  {
    code: 'tudo_no_lugar',
    title: 'Tudo no lugar',
    description: 'Cadastre pelo menos 3 contas neste mês, todas com uma categoria.',
    evaluate: ({ bills }) => {
      const target = Math.max(3, bills.total)
      return {
        current: Math.min(bills.categorized, target),
        target,
        done: bills.total >= 3 && bills.categorized >= bills.total,
        applicable: true,
      }
    },
  },
]

/** Um desafio por mês, em rodízio: todo mundo tem o mesmo desafio no mesmo mês. */
export function challengeForMonth(month: string): ChallengeDef {
  const [year, index] = month.split('-').map(Number)
  return CHALLENGES[(year * 12 + (index - 1)) % CHALLENGES.length]
}

// ─── Estatísticas a partir das linhas ────────────────────────────────────────

export function shiftMonth(month: string, delta: number) {
  const [year, index] = month.split('-').map(Number)
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7)
}

const UNCATEGORIZED = new Set(['', 'outros', 'other'])

export function isCategorized(category: string | null | undefined) {
  return !UNCATEGORIZED.has(String(category ?? '').trim().toLowerCase())
}

export interface BillRow {
  status: string | null
  due_date: string
  category?: string | null
}

/** Meses fechados (antes do mês de hoje, nos últimos 12) com pelo menos uma conta e todas pagas. */
export function countClosedMonthsAllPaid(bills: BillRow[], today: string) {
  const current = today.slice(0, 7)
  const oldest = shiftMonth(current, -12)
  const months = new Map<string, boolean>()
  for (const bill of bills) {
    const month = String(bill.due_date).slice(0, 7)
    if (month >= current || month < oldest) continue
    months.set(month, (months.get(month) ?? true) && isSettledBill(bill.status))
  }
  return [...months.values()].filter(Boolean).length
}

export function monthBillStats(bills: BillRow[], month: string) {
  const inMonth = bills.filter((bill) => String(bill.due_date).slice(0, 7) === month)
  return {
    total: inMonth.length,
    paid: inMonth.filter((bill) => isSettledBill(bill.status)).length,
    categorized: inMonth.filter((bill) => isCategorized(bill.category)).length,
  }
}

export function goalStats(goals: { current_amount: number | string | null; target_amount: number | string | null }[]) {
  let withFunds = 0
  let halfway = 0
  let completed = 0
  let balance = 0
  for (const goal of goals) {
    const current = Number(goal.current_amount) || 0
    const target = Number(goal.target_amount) || 0
    balance += current
    if (current > 0) withFunds += 1
    if (target > 0 && current >= target / 2) halfway += 1
    if (target > 0 && current >= target) completed += 1
  }
  return { total: goals.length, withFunds, halfway, completed, balance: Math.round(balance * 100) / 100 }
}

/** Selos que as estatísticas destravam e ainda não estão gravados. */
export function newlyUnlocked(stats: GamificationStats, unlockedCodes: Set<string>) {
  return ACHIEVEMENTS.filter((achievement) => !unlockedCodes.has(achievement.code) && achievement.unlocked(stats))
}

// ─── Estado enviado para a tela ──────────────────────────────────────────────

export interface AchievementView {
  code: string
  title: string
  description: string
  hint: string
  points: number
  icon: string
  unlockedAt: string | null
  progress?: Progress
}

export interface ChallengeView extends ChallengeResult {
  month: string
  code: string
  title: string
  description: string
  money: boolean
  points: number
  completedAt: string | null
}

/** Para um desafio, code é o mês (AAAA-MM), que identifica a linha. */
export interface UnseenItem {
  kind: 'achievement' | 'challenge'
  code: string
  title: string
  points: number
}

export type GamificationState =
  | {
      status: 'ok'
      points: number
      level: LevelInfo
      achievements: AchievementView[]
      challenge: ChallengeView
      unseen: UnseenItem[]
    }
  | { status: 'unavailable' }

export interface StoredAchievement {
  code: string
  points: number
  unlocked_at: string
  seen_at: string | null
}

export interface StoredChallenge {
  month: string
  code: string
  points: number
  completed_at: string | null
  seen_at: string | null
}

/** Monta o estado da tela a partir do que está gravado; os pontos são os gravados no desbloqueio. */
export function buildState(input: {
  stats: GamificationStats
  month: string
  challengeResult: ChallengeResult
  stored: StoredAchievement[]
  challenges: StoredChallenge[]
}): Extract<GamificationState, { status: 'ok' }> {
  const byCode = new Map(input.stored.map((row) => [row.code, row]))
  const challengePoints = input.challenges.reduce((sum, row) => sum + (row.completed_at ? Number(row.points) || 0 : 0), 0)
  const points = input.stored.reduce((sum, row) => sum + (Number(row.points) || 0), 0) + challengePoints

  const achievements: AchievementView[] = ACHIEVEMENTS.filter(
    (achievement) => !achievement.premiumFeature || input.stats.isPremium || byCode.has(achievement.code),
  ).map((achievement) => {
    const row = byCode.get(achievement.code)
    return {
      code: achievement.code,
      title: achievement.title,
      description: achievement.description,
      hint: achievement.hint,
      points: row ? Number(row.points) || 0 : achievement.points,
      icon: achievement.icon,
      unlockedAt: row?.unlocked_at ?? null,
      ...(achievement.progress && !row ? { progress: achievement.progress(input.stats) } : {}),
    }
  })

  const def = challengeForMonth(input.month)
  const currentRow = input.challenges.find((row) => row.month === input.month)
  const challenge: ChallengeView = {
    ...input.challengeResult,
    // Concluído fica concluído, mesmo que uma conta nova apareça depois.
    done: Boolean(currentRow?.completed_at) || input.challengeResult.done,
    month: input.month,
    code: def.code,
    title: def.title,
    description: def.description,
    money: Boolean(def.money),
    points: CHALLENGE_POINTS,
    completedAt: currentRow?.completed_at ?? null,
  }

  const titles = new Map(ACHIEVEMENTS.map((achievement) => [achievement.code, achievement.title]))
  const unseen: UnseenItem[] = [
    ...input.stored
      .filter((row) => !row.seen_at && titles.has(row.code))
      .map((row) => ({ kind: 'achievement' as const, code: row.code, title: titles.get(row.code) as string, points: Number(row.points) || 0 })),
    ...input.challenges
      .filter((row) => row.completed_at && !row.seen_at)
      .map((row) => ({
        kind: 'challenge' as const,
        code: row.month,
        title: CHALLENGES.find((item) => item.code === row.code)?.title ?? 'Desafio do mês',
        points: Number(row.points) || 0,
      })),
  ]

  return { status: 'ok', points, level: levelFor(points), achievements, challenge, unseen }
}
