'use server'

import Client from 'belvo'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Função Auxiliar: Verificação das Credenciais ─────────────────────────────
function validateEnvironmentVars() {
  const secretId = process.env.BELVO_SECRET_ID?.trim()
  const secretPassword = process.env.BELVO_SECRET_PASSWORD?.trim()
  const environment = process.env.BELVO_ENVIRONMENT?.trim() || 'sandbox'

  console.log('\n=================== [BELVO ENV CHECK] ===================')
  console.log('Ambiente:', environment)
  console.log('BELVO_SECRET_ID presente?:', !!secretId, `(tamanho: ${secretId?.length || 0})`)
  console.log('BELVO_SECRET_PASSWORD presente?:', !!secretPassword, `(tamanho: ${secretPassword?.length || 0})`)
  if (secretId) {
    console.log('ID preview:', `${secretId.slice(0, 4)}...${secretId.slice(-4)}`)
  }
  console.log('=========================================================\n')

  return { secretId, secretPassword, environment }
}

// ─── 1. Gerar Token com Diagnóstico Detalhado ─────────────────────────────────
export async function getBelvoAccessToken() {
  const { secretId, secretPassword, environment } = validateEnvironmentVars()

  if (!secretId || !secretPassword) {
    const errorMsg = 'Credenciais ausentes no .env.local (verifique BELVO_SECRET_ID e BELVO_SECRET_PASSWORD)'
    console.error(`[Belvo Config Error]: ${errorMsg}`)
    return { error: errorMsg }
  }

  const baseUrl = environment === 'production' 
    ? 'https://api.belvo.com' 
    : 'https://sandbox.belvo.com'

  try {
    console.log(`[Belvo] Solicitando Widget Token para: ${baseUrl}/api/token/`)

    const response = await fetch(`${baseUrl}/api/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        id: secretId,
        password: secretPassword,
        scopes: 'read_institutions,write_links,read_links',
      }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      console.error('\n🚨 [ERRO NA API DA BELVO]:')
      console.error('Status HTTP:', response.status)
      console.error('Headers de resposta:', Object.fromEntries(response.headers.entries()))
      console.error('Corpo da resposta (Detalhes do erro):', JSON.stringify(data, null, 2))
      console.error('-----------------------------------------------------\n')

      const detailMsg = data?.detail || data?.message || (Array.isArray(data) ? JSON.stringify(data) : null)
      return { 
        error: `Erro Belvo (${response.status}): ${detailMsg || 'Falha na autenticação das chaves'}` 
      }
    }

    console.log('✅ [Belvo] Token gerado com sucesso!')
    return { accessToken: data.access }

  } catch (err: any) {
    console.error('🚨 [Belvo Network Exception]:', err)
    return { error: `Erro de conexão com a Belvo: ${err.message || 'Falha desconhecida'}` }
  }
}

// ─── 2. Salvar Banco Conectado no Supabase ────────────────────────────────────
export async function saveConnectedBank(
  linkId: string,
  institutionName: string,
  institutionLogo?: string
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error('[Supabase Auth Error]: Usuário não encontrado ou sessão expirada.', userError)
      return { error: 'Usuário não autenticado' }
    }

    const formattedName = institutionName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())

    console.log(`[Supabase] Inserindo banco ${formattedName} (Link ID: ${linkId}) para usuário: ${user.id}`)

    const { data, error } = await supabase
      .from('connected_banks')
      .upsert(
        {
          user_id: user.id,
          item_id: linkId,
          institution_name: formattedName,
          institution_logo: institutionLogo || null,
          item_status: 'UPDATING',
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,item_id' }
      )
      .select()
      .single()

    if (error) {
      console.error('\n🚨 [Supabase Error - connected_banks]:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      throw error
    }

    return { success: true, bank: data }
  } catch (error: any) {
    return { error: `Falha ao salvar banco: ${error?.message || error}` }
  }
}

// ─── 3. Sincronização com Auditoria do Schema ─────────────────────────────────
export async function syncBelvoBankData(linkId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado' }

    const { secretId, secretPassword, environment } = validateEnvironmentVars()
    const belvo = new Client(secretId!, secretPassword!, environment as any)
    await belvo.connect()

    // ── A. Contas ─────────────────────────────────────────────────────────────
    let accCount = 0
    try {
      const accounts = await belvo.accounts.retrieve(linkId)
      if (accounts?.length) {
        const accountRows = accounts.map((acc: any) => ({
          user_id: user.id,
          pluggy_account_id: acc.id,
          item_id: linkId,
          name: acc.name || 'Conta Bancária',
          type: acc.category || 'BANK',
          subtype: acc.type || 'CHECKING_ACCOUNT',
          balance: acc.balance?.current || 0,
          credit_limit: acc.credit_data?.credit_limit || null,
          currency_code: acc.currency || 'BRL',
          last_synced_at: new Date().toISOString(),
        }))

        const { error: accError } = await supabase
          .from('synced_accounts')
          .upsert(accountRows, { onConflict: 'user_id,pluggy_account_id' })

        if (accError) {
          console.error('🚨 [Supabase Error - synced_accounts]:', accError)
        } else {
          accCount = accounts.length
        }
      }
    } catch (err) {
      console.warn('[Belvo Sync Accounts]:', err)
    }

    // ── B. Investimentos (Diagnóstico de Erros) ────────────────────────────────
    let invCount = 0
    try {
      // @ts-ignore
      const portfolios = await belvo.investmentPortfolios?.retrieve(linkId)
      if (portfolios?.length) {
        const instruments = portfolios.flatMap((p: any) => p.instruments || [])
        if (instruments.length) {
          const invRows = instruments.map((inst: any) => {
            const ticker = (inst.ticker || inst.code || inst.name?.slice(0, 10) || `INV-${inst.id}`).trim().toUpperCase()
            const name = inst.name || inst.description || ticker || 'Ativo Financeiro'

            return {
              user_id: user.id,
              ticker,
              name,
              ticker_name: name,
              quantity: Number(inst.quantity) || 1,
              price: Number(inst.price || inst.balance || inst.amount || 0),
              dividend_yield: 0,
              category: inst.type || 'Outros',
              updated_at: new Date().toISOString(),
            }
          })

          console.log('[Supabase] Payload preparado para investments (1ª linha):', invRows[0])

          const { error: invErr } = await supabase
            .from('investments')
            .upsert(invRows, { onConflict: 'user_id,ticker' })

          if (invErr) {
            console.error('\n🚨 [Supabase Error - investments]:')
            console.error('Código PostgREST:', invErr.code)
            console.error('Mensagem:', invErr.message)
            console.error('Detalhes adicionais:', invErr.details)
            console.error('Dica do Postgres (Hint):', invErr.hint)
            console.error('-----------------------------------------------------\n')
          } else {
            invCount = invRows.length
          }
        }
      }
    } catch (err) {
      console.warn('[Belvo Sync Investments]:', err)
    }

    // ── C. Finalização ────────────────────────────────────────────────────────
    await supabase
      .from('connected_banks')
      .update({
        item_status: 'UPDATED',
        last_synced_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('item_id', linkId)

    revalidatePath('/open-finance')
    return { success: true, accCount, invCount }

  } catch (error: any) {
    console.error('🚨 [Belvo Sync Critical]:', error)
    return { error: `Erro na sincronização: ${error?.message || error}` }
  }
}

// ─── 4. Listar Bancos Conectados ──────────────────────────────────────────────
export async function getConnectedBanks() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado', banks: [] }

    const { data, error } = await supabase
      .from('connected_banks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return { success: true, banks: data || [] }
  } catch (error) {
    console.error('[Supabase Error - getConnectedBanks]:', error)
    return { error: 'Falha ao carregar bancos', banks: [] }
  }
}

// ─── 5. Desconectar Banco ─────────────────────────────────────────────────────
export async function disconnectBank(linkId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado' }

    const { error } = await supabase
      .from('connected_banks')
      .delete()
      .eq('user_id', user.id)
      .eq('item_id', linkId)

    if (error) throw error
    revalidatePath('/open-finance')
    return { success: true }
  } catch (error) {
    console.error('[Supabase Error - disconnectBank]:', error)
    return { error: 'Falha ao desconectar banco' }
  }
}
