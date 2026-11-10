import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchAllPages, isMissingTableError } from '@/lib/finance-insights'
import {
  CHALLENGE_POINTS,
  buildState,
  challengeForMonth,
  countClosedMonthsAllPaid,
  goalStats,
  monthBillStats,
  newlyUnlocked,
  shiftMonth,
  type BillRow,
  type GamificationState,
  type GamificationStats,
  type StoredAchievement,
  type StoredChallenge,
} from '@/lib/gamification'

type Admin = SupabaseClient

/** Basta saber se passou de 30 dias de histórico. */
const SNAPSHOT_DAYS_LIMIT = 120

class MissingTable extends Error {}

function check<T>(result: { data: T; error: { code?: string; message?: string } | null }) {
  if (result.error) throw isMissingTableError(result.error) ? new MissingTable() : result.error
  return result.data
}

async function count(query: PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>, optional = false) {
  const { count: total, error } = await query
  if (error) {
    // Recursos de migrações que podem não ter sido aplicadas contam como zero.
    if (optional && isMissingTableError(error)) return 0
    throw error
  }
  return total ?? 0
}

type ChallengeRow = StoredChallenge & { baseline: { goalsBalance?: number } | null }

const CHALLENGE_COLUMNS = 'month, code, points, completed_at, seen_at, baseline'

const loadAchievements = async (admin: Admin, userId: string) =>
  (check(await admin.from('user_achievements').select('code, points, unlocked_at, seen_at').eq('user_id', userId)) ?? []) as StoredAchievement[]

const loadChallenges = async (admin: Admin, userId: string) =>
  (check(await admin.from('user_challenges').select(CHALLENGE_COLUMNS).eq('user_id', userId)) ?? []) as ChallengeRow[]

function baselineOf(row: ChallengeRow | undefined) {
  const value = Number(row?.baseline?.goalsBalance)
  return row && Number.isFinite(value) ? value : null
}

function withoutBaseline({ baseline: _baseline, ...row }: ChallengeRow): StoredChallenge {
  return row
}

async function loadData(admin: Admin, userId: string, today: string) {
  const current = today.slice(0, 7)
  const head = { count: 'exact' as const, head: true }

  const [bills, billsTotal, billsPaid, goals, investmentsTotal, banksConnected, snapshots, priceAlerts] = await Promise.all([
    fetchAllPages<BillRow>((from, to) =>
      admin
        .from('bills')
        .select('status, due_date, category')
        .eq('user_id', userId)
        .gte('due_date', `${shiftMonth(current, -12)}-01`)
        .lt('due_date', `${shiftMonth(current, 1)}-01`)
        .order('due_date', { ascending: true })
        .range(from, to),
    ),
    count(admin.from('bills').select('*', head).eq('user_id', userId)),
    count(admin.from('bills').select('*', head).eq('user_id', userId).ilike('status', 'paid')),
    admin.from('goals').select('current_amount, target_amount').eq('user_id', userId),
    count(admin.from('investments').select('*', head).eq('user_id', userId)),
    count(admin.from('connected_banks').select('*', head).eq('user_id', userId), true),
    admin
      .from('portfolio_snapshots')
      .select('day')
      .eq('user_id', userId)
      .order('day', { ascending: false })
      .limit(SNAPSHOT_DAYS_LIMIT),
    count(admin.from('price_alerts').select('*', head).eq('user_id', userId), true),
  ])

  if (goals.error) throw goals.error
  let snapshotDays = 0
  if (snapshots.error) {
    if (!isMissingTableError(snapshots.error)) throw snapshots.error
  } else {
    // Carteira manual e Open Finance têm uma foto cada no mesmo dia.
    snapshotDays = new Set((snapshots.data ?? []).map((row) => row.day as string)).size
  }

  return { bills, billsTotal, billsPaid, goals: goals.data ?? [], investmentsTotal, banksConnected, snapshotDays, priceAlerts }
}

/**
 * Confere o desafio do mês e os selos da pessoa e grava o que ela acabou de conquistar.
 * Com write=false (limite de requisições), só calcula: nada é gravado nem destravado.
 * Sempre filtra por userId: roda com o cliente admin, que ignora o RLS.
 */
export async function syncUserGamification(
  admin: Admin,
  userId: string,
  today: string,
  options: { isPremium: boolean; write: boolean },
): Promise<GamificationState> {
  try {
    const [storedAchievements, storedChallenges, data] = await Promise.all([
      loadAchievements(admin, userId),
      loadChallenges(admin, userId),
      loadData(admin, userId, today),
    ])
    const goals = goalStats(data.goals)

    const month = today.slice(0, 7)
    const def = challengeForMonth(month)
    let currentRow = storedChallenges.find((row) => row.month === month)

    if (options.write && !currentRow) {
      // Duas chamadas ao mesmo tempo: a primeira grava o ponto de partida e a outra relê o dela.
      check(
        await admin
          .from('user_challenges')
          .upsert(
            { user_id: userId, month, code: def.code, baseline: { goalsBalance: goals.balance } },
            { onConflict: 'user_id,month', ignoreDuplicates: true },
          ),
      )
      const row = check(
        await admin.from('user_challenges').select(CHALLENGE_COLUMNS).eq('user_id', userId).eq('month', month).maybeSingle(),
      ) as ChallengeRow | null
      currentRow = row ?? undefined
    }

    let challengeRow = currentRow ? withoutBaseline(currentRow) : undefined
    // Sem linha gravada (limite de requisições), o desafio de guardar parte de agora.
    const baseline = baselineOf(currentRow)

    const challengeResult = def.evaluate({
      bills: monthBillStats(data.bills, month),
      goalsCount: goals.total,
      goalsBalance: goals.balance,
      baseline,
    })

    if (options.write && challengeRow && !challengeRow.completed_at && challengeResult.done) {
      // Só a primeira chamada grava: os pontos do desafio não podem entrar em dobro.
      const updated = check(
        await admin
          .from('user_challenges')
          .update({ completed_at: new Date().toISOString(), points: CHALLENGE_POINTS })
          .eq('user_id', userId)
          .eq('month', month)
          .is('completed_at', null)
          .select('month, code, points, completed_at, seen_at'),
      ) as StoredChallenge[] | null
      if (updated?.[0]) challengeRow = updated[0]
    }

    const challenges = [
      ...storedChallenges.filter((row) => row.month !== month).map(withoutBaseline),
      ...(challengeRow ? [challengeRow] : []),
    ]
    const stats: GamificationStats = {
      billsTotal: data.billsTotal,
      billsPaid: data.billsPaid,
      closedMonthsAllPaid: countClosedMonthsAllPaid(data.bills, today),
      goalsTotal: goals.total,
      goalsWithFunds: goals.withFunds,
      goalsHalfway: goals.halfway,
      goalsCompleted: goals.completed,
      investmentsTotal: data.investmentsTotal,
      banksConnected: data.banksConnected,
      snapshotDays: data.snapshotDays,
      priceAlerts: data.priceAlerts,
      challengesCompleted: challenges.filter((row) => row.completed_at).length,
      isPremium: options.isPremium,
    }

    let achievements = storedAchievements
    const fresh = newlyUnlocked(stats, new Set(achievements.map((row) => row.code)))
    if (options.write && fresh.length > 0) {
      check(
        await admin.from('user_achievements').upsert(
          fresh.map((achievement) => ({ user_id: userId, code: achievement.code, points: achievement.points })),
          { onConflict: 'user_id,code', ignoreDuplicates: true },
        ),
      )
      achievements = await loadAchievements(admin, userId)
    }

    return buildState({ stats, month, challengeResult, stored: achievements, challenges })
  } catch (error) {
    if (error instanceof MissingTable) return { status: 'unavailable' }
    throw error
  }
}
