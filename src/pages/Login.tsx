import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Button, TextInput } from '../components/UI'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setLoading(false)
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-stone-50 px-6 dark:bg-stone-950">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-700 text-2xl font-bold text-white">
            $
          </div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Caja Pastelería</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">Ingresá con tu cuenta</p>
        </div>
        <div className="space-y-3">
          <TextInput
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextInput
            type="password"
            placeholder="Contraseña"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </div>
  )
}
