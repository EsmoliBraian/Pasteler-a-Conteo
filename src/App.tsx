import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Ventas = lazy(() => import('./pages/Ventas'))
const Sobres = lazy(() => import('./pages/Sobres'))
const Deudas = lazy(() => import('./pages/Deudas'))
const Mas = lazy(() => import('./pages/Mas'))
const GastosFijos = lazy(() => import('./pages/GastosFijos'))
const Recetas = lazy(() => import('./pages/Recetas'))
const Retiro = lazy(() => import('./pages/Retiro'))
const Gastos = lazy(() => import('./pages/Gastos'))
const Tarjetas = lazy(() => import('./pages/Tarjetas'))
const Conteo = lazy(() => import('./pages/Conteo'))
const Ajustes = lazy(() => import('./pages/Ajustes'))

function Loading() {
  return <div className="flex min-h-[50svh] items-center justify-center text-neutral-400">Cargando…</div>
}

function Gate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-neutral-400">
        Cargando…
      </div>
    )
  }
  if (!session) return <Login />
  return <>{children}</>
}

function ConfigMissing() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-neutral-50 px-6 dark:bg-neutral-950">
      <div className="max-w-sm space-y-3 text-center">
        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-700 text-2xl font-bold text-white">
          !
        </div>
        <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-50">Falta configurar Supabase</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No encontré <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">VITE_SUPABASE_URL</code> ni{' '}
          <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">VITE_SUPABASE_ANON_KEY</code>. En desarrollo local,
          creá un archivo <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">.env</code> (mirá{' '}
          <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">.env.example</code>). En producción, cargalas como
          secrets de GitHub Actions.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigMissing />
  return (
    <AuthProvider>
      <BrowserRouter basename="/Pasteler-a-Conteo">
        <Gate>
          <Layout>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/ventas" element={<Ventas />} />
                <Route path="/sobres" element={<Sobres />} />
                <Route path="/deudas" element={<Deudas />} />
                <Route path="/mas" element={<Mas />} />
                <Route path="/mas/gastos-fijos" element={<GastosFijos />} />
                <Route path="/mas/recetas" element={<Recetas />} />
                <Route path="/mas/retiro" element={<Retiro />} />
                <Route path="/mas/gastos" element={<Gastos />} />
                <Route path="/mas/tarjetas" element={<Tarjetas />} />
                <Route path="/mas/conteo" element={<Conteo />} />
                <Route path="/mas/ajustes" element={<Ajustes />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Layout>
        </Gate>
      </BrowserRouter>
    </AuthProvider>
  )
}
