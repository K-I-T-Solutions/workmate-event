import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { auth } from '../api/client'

interface AuthState { token: string | null; role: string | null; username: string | null }
interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

function parseJWT(token: string): { username?: string; role?: string } {
  try { return JSON.parse(atob(token.split('.')[1])) } catch { return {} }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('token')
    if (!token) return { token: null, role: null, username: null }
    const { username, role } = parseJWT(token)
    return { token, role: role ?? null, username: username ?? null }
  })

  const login = useCallback(async (username: string, password: string) => {
    const res = await auth.login(username, password)
    localStorage.setItem('token', res.token)
    setState({ token: res.token, role: res.role, username })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setState({ token: null, role: null, username: null })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, isAuthenticated: !!state.token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
