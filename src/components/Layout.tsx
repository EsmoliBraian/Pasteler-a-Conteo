import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Receipt, Wallet, Landmark, MoreHorizontal } from 'lucide-react'

const tabs = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/ventas', label: 'Ventas', icon: Receipt },
  { to: '/sobres', label: 'Sobres', icon: Wallet },
  { to: '/deudas', label: 'Deudas', icon: Landmark },
  { to: '/mas', label: 'Más', icon: MoreHorizontal },
]

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full bg-neutral-50 dark:bg-neutral-950">
      {/* Barra lateral: solo en pantallas medianas/grandes (escritorio) */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-4 md:flex dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-700 text-lg font-bold text-white">
            $
          </div>
          <span className="font-bold text-neutral-900 dark:text-neutral-50">Caja Pastelería</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`
              }
            >
              <Icon size={18} strokeWidth={2.2} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Contenido: ancho de celular en mobile, columna cómoda centrada en escritorio */}
      <div className="flex min-h-svh flex-1 flex-col md:items-center">
        <main className="mx-auto w-full max-w-md flex-1 overflow-y-auto pb-24 md:max-w-2xl md:px-6 md:pb-10 md:pt-6">
          {children}
        </main>
      </div>

      {/* Nav inferior: solo en mobile */}
      <nav
        className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-md border-t border-neutral-200 bg-white/95 backdrop-blur md:hidden dark:border-neutral-800 dark:bg-neutral-900/95"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                isActive
                  ? 'text-amber-700 dark:text-amber-500'
                  : 'text-neutral-400 dark:text-neutral-500'
              }`
            }
          >
            <Icon size={22} strokeWidth={2.2} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
