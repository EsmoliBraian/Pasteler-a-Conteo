import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type QueryBuilder = ReturnType<ReturnType<typeof supabase.from>['select']>

/**
 * Trae todas las filas de una tabla y se re-suscribe a cambios en tiempo real
 * (para que ambos celulares vean lo mismo sin refrescar). `configure` deja
 * aplicar filtros/orden a la query antes de ejecutarla.
 */
export function useTable<T>(
  table: string,
  configure?: (q: QueryBuilder) => QueryBuilder,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configureRef = useRef(configure)
  configureRef.current = configure

  const refetch = useCallback(async () => {
    let query = supabase.from(table).select('*') as unknown as QueryBuilder
    if (configureRef.current) query = configureRef.current(query)
    const { data, error } = await query
    if (error) setError(error.message)
    else {
      setData((data ?? []) as T[])
      setError(null)
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, ...deps])

  useEffect(() => {
    refetch()
    const channel = supabase
      .channel(`realtime:${table}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => refetch())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch, table])

  return { data, loading, error, refetch }
}
