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
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-stone-50 dark:bg-stone-950">
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>
      <nav
        className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-md border-t border-stone-200 bg-white/95 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95"
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
                  : 'text-stone-400 dark:text-stone-500'
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
