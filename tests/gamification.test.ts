import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENTS,
  CHALLENGES,
  CHALLENGE_POINTS,
  buildState,
  challengeForMonth,
  countClosedMonthsAllPaid,
  goalStats,
  isCategorized,
  levelFor,
  monthBillStats,
  newlyUnlocked,
  type GamificationStats,
} from '@/lib/gamification'

const empty: GamificationStats = {
  billsTotal: 0,
  billsPaid: 0,
  closedMonthsAllPaid: 0,
  goalsTotal: 0,
  goalsWithFunds: 0,
  goalsHalfway: 0,
  goalsCompleted: 0,
  investmentsTotal: 0,
  banksConnected: 0,
  snapshotDays: 0,
  priceAlerts: 0,
  challengesCompleted: 0,
  isPremium: false,
}

const unlockedCodes = (stats: Partial<GamificationStats>) =>
  newlyUnlocked({ ...empty, ...stats }, new Set()).map((achievement) => achievement.code)

describe('countClosedMonthsAllPaid', () => {
  const today = '2026-11-09'

  it('conta só meses fechados com todas as contas pagas', () => {
    const bills = [
      { status: 'paid', due_date: '2026-10-05' },
      { status: 'PAID', due_date: '2026-10-20T00:00:00' },
      { status: 'paid', due_date: '2026-09-10' },
      { status: 'pending', due_date: '2026-09-15' },
      { status: 'paid', due_date: '2026-08-01' },
      // Mês corrente não conta, mesmo todo pago.
      { status: 'paid', due_date: '2026-11-01' },
    ]
    expect(countClosedMonthsAllPaid(bills, today)).toBe(2)
  })

  it('ignora meses de mais de 12 meses atrás e meses sem contas', () => {
    const bills = [
      { status: 'paid', due_date: '2025-11-30' },
      { status: 'paid', due_date: '2025-10-31' },
    ]
    expect(countClosedMonthsAllPaid(bills, today)).toBe(1)
    expect(countClosedMonthsAllPaid([], today)).toBe(0)
  })
})

describe('monthBillStats e goalStats', () => {
  it('conta contas do mês, pagas e com categoria', () => {
    const bills = [
      { status: 'paid', due_date: '2026-11-01', category: 'Moradia' },
      { status: 'pending', due_date: '2026-11-10', category: 'outros' },
      { status: 'paid', due_date: '2026-11-30T23:00:00', category: ' ' },
      { status: 'paid', due_date: '2026-12-01', category: 'Lazer' },
    ]
    expect(monthBillStats(bills, '2026-11')).toEqual({ total: 3, paid: 2, categorized: 1 })
  })

  it('reconhece categoria vazia, Outros e other como sem categoria', () => {
    expect(isCategorized('Outros')).toBe(false)
    expect(isCategorized('other')).toBe(false)
    expect(isCategorized(null)).toBe(false)
    expect(isCategorized('Saúde')).toBe(true)
  })

  it('calcula metas com dinheiro, na metade e concluídas', () => {
    expect(
      goalStats([
        { current_amount: 0, target_amount: 1000 },
        { current_amount: '500', target_amount: '1000' },
        { current_amount: 1200, target_amount: 1000 },
        { current_amount: 10, target_amount: 0 },
      ]),
    ).toEqual({ total: 4, withFunds: 3, halfway: 2, completed: 1, balance: 1710 })
  })
})

describe('conquistas', () => {
  it('nada destravado sem dados', () => {
    expect(unlockedCodes({})).toEqual([])
  })

  it('respeita os limites de cada selo', () => {
    expect(unlockedCodes({ billsTotal: 1 })).toEqual(['primeira_conta'])
    expect(unlockedCodes({ billsTotal: 9, billsPaid: 9 })).toEqual(['primeira_conta', 'primeira_paga'])
    expect(unlockedCodes({ billsPaid: 10 })).toContain('dez_pagas')
    expect(unlockedCodes({ billsPaid: 49 })).not.toContain('cinquenta_pagas')
    expect(unlockedCodes({ billsPaid: 50 })).toContain('cinquenta_pagas')
    expect(unlockedCodes({ closedMonthsAllPaid: 2 })).toEqual(['mes_em_dia'])
    expect(unlockedCodes({ closedMonthsAllPaid: 6 })).toEqual(['mes_em_dia', 'tres_meses_em_dia', 'seis_meses_em_dia'])
    expect(unlockedCodes({ goalsTotal: 1, goalsWithFunds: 1, goalsHalfway: 1, goalsCompleted: 1 })).toEqual([
      'primeira_meta',
      'primeiro_deposito',
      'meio_caminho',
      'meta_concluida',
    ])
    expect(unlockedCodes({ banksConnected: 1 })).toEqual(['carteira'])
    expect(unlockedCodes({ investmentsTotal: 3 })).toEqual(['carteira'])
    expect(unlockedCodes({ snapshotDays: 29 })).toEqual([])
    expect(unlockedCodes({ snapshotDays: 30 })).toEqual(['historico_30'])
    expect(unlockedCodes({ priceAlerts: 1 })).toEqual(['primeiro_alerta'])
    expect(unlockedCodes({ challengesCompleted: 3 })).toEqual(['primeiro_desafio', 'tres_desafios'])
  })

  it('não repete o que já está gravado', () => {
    const fresh = newlyUnlocked({ ...empty, billsTotal: 1, billsPaid: 1 }, new Set(['primeira_conta']))
    expect(fresh.map((achievement) => achievement.code)).toEqual(['primeira_paga'])
  })

  it('o progresso não passa do alvo', () => {
    const tenPaid = ACHIEVEMENTS.find((achievement) => achievement.code === 'dez_pagas')
    expect(tenPaid?.progress?.({ ...empty, billsPaid: 37 })).toEqual({ current: 10, target: 10 })
  })

  it('tem códigos únicos e válidos para o banco', () => {
    const codes = ACHIEVEMENTS.map((achievement) => achievement.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of [...codes, ...CHALLENGES.map((challenge) => challenge.code)]) expect(code).toMatch(/^[a-z0-9_]{1,40}$/)
  })
})

describe('levelFor', () => {
  it('acerta as fronteiras dos níveis', () => {
    expect(levelFor(0)).toMatchObject({ index: 1, name: 'Iniciante', nextName: 'Organizado', nextMin: 50, pct: 0 })
    expect(levelFor(49).name).toBe('Iniciante')
    expect(levelFor(25).pct).toBe(50)
    expect(levelFor(50)).toMatchObject({ index: 2, name: 'Organizado', pct: 0 })
    expect(levelFor(799).name).toBe('Estrategista')
    expect(levelFor(800)).toMatchObject({ index: 6, name: 'Mestre das finanças', nextName: null, nextMin: null, pct: 100 })
    expect(levelFor(5000).index).toBe(6)
    expect(levelFor(-10).index).toBe(1)
  })
})

describe('desafio do mês', () => {
  const byCode = (code: string) => CHALLENGES.find((challenge) => challenge.code === code)!
  const noBills = { total: 0, paid: 0, categorized: 0 }

  it('faz rodízio entre os três desafios, igual para todos no mesmo mês', () => {
    const months = ['2026-11', '2026-12', '2027-01', '2027-02']
    const codes = months.map((month) => challengeForMonth(month).code)
    expect(new Set(codes.slice(0, 3)).size).toBe(3)
    expect(codes[3]).toBe(codes[0])
    expect(challengeForMonth('2026-11').code).toBe(challengeForMonth('2026-11').code)
  })

  it('Mês em dia: precisa de contas e de todas pagas', () => {
    const challenge = byCode('mes_em_dia_desafio')
    const base = { goalsCount: 0, goalsBalance: 0, baseline: null }
    expect(challenge.evaluate({ ...base, bills: noBills })).toMatchObject({ applicable: false, done: false })
    expect(challenge.evaluate({ ...base, bills: { total: 3, paid: 2, categorized: 0 } })).toMatchObject({
      applicable: true,
      done: false,
      current: 2,
      target: 3,
    })
    expect(challenge.evaluate({ ...base, bills: { total: 3, paid: 3, categorized: 0 } }).done).toBe(true)
  })

  it('Reforce suas metas: mede a partir do ponto de partida do mês', () => {
    const challenge = byCode('reforce_metas')
    expect(challenge.evaluate({ bills: noBills, goalsCount: 0, goalsBalance: 0, baseline: null })).toMatchObject({ applicable: false })
    expect(challenge.evaluate({ bills: noBills, goalsCount: 1, goalsBalance: 1050, baseline: 1000 })).toMatchObject({
      applicable: true,
      current: 50,
      target: 100,
      done: false,
    })
    expect(challenge.evaluate({ bills: noBills, goalsCount: 1, goalsBalance: 1100, baseline: 1000 }).done).toBe(true)
    // Resgate não deixa o progresso negativo; sem ponto de partida gravado, começa do zero.
    expect(challenge.evaluate({ bills: noBills, goalsCount: 1, goalsBalance: 900, baseline: 1000 }).current).toBe(0)
    expect(challenge.evaluate({ bills: noBills, goalsCount: 1, goalsBalance: 5000, baseline: null }).current).toBe(0)
  })

  it('Tudo no lugar: pelo menos 3 contas, todas com categoria', () => {
    const challenge = byCode('tudo_no_lugar')
    const base = { goalsCount: 0, goalsBalance: 0, baseline: null }
    expect(challenge.evaluate({ ...base, bills: { total: 2, paid: 0, categorized: 2 } })).toMatchObject({ done: false, target: 3 })
    expect(challenge.evaluate({ ...base, bills: { total: 4, paid: 0, categorized: 3 } })).toMatchObject({ done: false, target: 4 })
    expect(challenge.evaluate({ ...base, bills: { total: 4, paid: 0, categorized: 4 } }).done).toBe(true)
  })
})

describe('buildState', () => {
  const month = '2026-11'
  const challengeResult = { current: 0, target: 0, done: false, applicable: false }

  it('soma os pontos gravados e lista os avisos ainda não vistos', () => {
    const state = buildState({
      stats: empty,
      month,
      challengeResult,
      stored: [
        { code: 'primeira_conta', points: 10, unlocked_at: '2026-11-01T10:00:00Z', seen_at: '2026-11-01T10:01:00Z' },
        { code: 'meta_concluida', points: 50, unlocked_at: '2026-11-02T10:00:00Z', seen_at: null },
      ],
      challenges: [
        { month: '2026-10', code: 'reforce_metas', points: CHALLENGE_POINTS, completed_at: '2026-10-20T00:00:00Z', seen_at: null },
        { month, code: challengeForMonth(month).code, points: 0, completed_at: null, seen_at: null },
      ],
    })
    expect(state.points).toBe(100)
    expect(state.level.name).toBe('Organizado')
    expect(state.unseen).toEqual([
      { kind: 'achievement', code: 'meta_concluida', title: 'Meta batida', points: 50 },
      { kind: 'challenge', code: '2026-10', title: 'Reforce suas metas', points: CHALLENGE_POINTS },
    ])
    expect(state.challenge).toMatchObject({ month, done: false, completedAt: null, points: CHALLENGE_POINTS })
  })

  it('esconde selos do Premium de quem não assina, a não ser que já tenha destravado', () => {
    const codes = (isPremium: boolean, stored = [] as { code: string; points: number; unlocked_at: string; seen_at: string | null }[]) =>
      buildState({ stats: { ...empty, isPremium }, month, challengeResult, stored, challenges: [] }).achievements.map((item) => item.code)
    expect(codes(false)).not.toContain('primeiro_alerta')
    expect(codes(true)).toContain('primeiro_alerta')
    expect(codes(false, [{ code: 'primeiro_alerta', points: 10, unlocked_at: '2026-11-01T00:00:00Z', seen_at: null }])).toContain(
      'primeiro_alerta',
    )
  })

  it('desafio concluído continua concluído mesmo que o mês mude depois', () => {
    const state = buildState({
      stats: empty,
      month,
      challengeResult: { current: 2, target: 3, done: false, applicable: true },
      stored: [],
      challenges: [{ month, code: challengeForMonth(month).code, points: CHALLENGE_POINTS, completed_at: '2026-11-05T00:00:00Z', seen_at: null }],
    })
    expect(state.challenge.done).toBe(true)
    expect(state.points).toBe(CHALLENGE_POINTS)
  })

  it('mostra progresso só dos selos ainda bloqueados', () => {
    const state = buildState({
      stats: { ...empty, billsPaid: 4 },
      month,
      challengeResult,
      stored: [{ code: 'dez_pagas', points: 20, unlocked_at: '2026-11-01T00:00:00Z', seen_at: null }],
      challenges: [],
    })
    const find = (code: string) => state.achievements.find((item) => item.code === code)
    expect(find('dez_pagas')?.progress).toBeUndefined()
    expect(find('cinquenta_pagas')?.progress).toEqual({ current: 4, target: 50 })
  })
})
