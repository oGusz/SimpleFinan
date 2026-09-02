import useSWR from 'swr'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Falha ao buscar cotação')
  return res.json()
}

export function useStockQuote(ticker: string) {
  const { data, error, isLoading } = useSWR(
    ticker ? `/api/quotes/${ticker}` : null,
    fetcher,
    {
      refreshInterval: 60000, // Rebusca a cada 60 segundos
      revalidateOnFocus: true, // Atualiza quando o usuário volta para a aba do navegador
      dedupingInterval: 10000, // Evita chamadas duplicadas num intervalo de 10s
    }
  )

  return {
    price: data?.price as number | undefined,
    isLoading,
    isError: error,
  }
}