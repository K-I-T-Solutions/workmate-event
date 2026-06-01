import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Alert, Spinner } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch {
      setError('Ungültige Anmeldedaten')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-wm-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Sign mit Glow */}
        <div className="flex flex-col items-center mb-8">
          <img src="/sign-event.png" alt="WORKMATE EVENT" className="h-20 w-auto mb-4" />
          <p className="text-wm-muted text-sm tracking-wide">K.I.T. Solutions</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Benutzername</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)}
              autoComplete="username" autoFocus required />
          </div>
          <div>
            <label className="label">Passwort</label>
            <input className="input" type="password" value={password}
              onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          {error && <Alert type="error" message={error} />}
          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? <Spinner size="sm" /> : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  )
}
