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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
            WE
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Workmate Event</h1>
          <p className="text-slate-500 text-sm mt-1">K.I.T. Solutions</p>
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
