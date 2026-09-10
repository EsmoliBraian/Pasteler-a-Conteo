import { Link } from 'react-router-dom'
import { PageHeader } from '../components/UI'
import { CalculatorIcon, ChefHat, ChevronRight, CreditCard, PiggyBank, Receipt, Settings, Wallet2 } from 'lucide-react'

const items = [
  { to: '/mas/gastos-fijos', label: 'Gastos fijos', desc: 'Alquiler, sueldos, impuestos', icon: Wallet2 },
  { to: '/mas/gastos', label: 'Gastos', desc: 'Del local (Insumos) o personales (Retiro)', icon: Receipt },
  { to: '/mas/tarjetas', label: 'Compras con tarjeta', desc: 'MercadoLibre y otras compras, con fecha de pago', icon: CreditCard },
  { to: '/mas/conteo', label: 'Conteo de caja', desc: 'Comparar efectivo/alias/QR/PosNET contra lo esperado', icon: CalculatorIcon },
  { to: '/mas/recetas', label: 'Costos y recetas', desc: 'Ingredientes, márgenes, importar Excel', icon: ChefHat },
  { to: '/mas/retiro', label: 'Retiro personal', desc: 'Nuestro sueldo del mes', icon: PiggyBank },
  { to: '/mas/ajustes', label: 'Ajustes', desc: 'Medios de pago, sobres, punto de equilibrio', icon: Settings },
]

export default function Mas() {
  return (
    <div>
      <PageHeader title="Más" />
      <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-2">
        {items.map(({ to, label, desc, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm active:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:active:bg-stone-800"
          >
            <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              <Icon size={20} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-stone-900 dark:text-stone-50">{label}</p>
              <p className="text-xs text-stone-400">{desc}</p>
            </div>
            <ChevronRight size={18} className="text-stone-300" />
          </Link>
        ))}
      </div>
    </div>
  )
}
