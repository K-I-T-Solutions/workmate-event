import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login      from './pages/Login'
import Dashboard  from './pages/Dashboard'
import Tickets    from './pages/Tickets'
import Scanner    from './pages/Scanner'
import Kasse      from './pages/Kasse'
import Equipment  from './pages/Equipment'
import Staff      from './pages/Staff'
import Program    from './pages/Program'
import Livestream from './pages/Livestream'
import Reporting  from './pages/Reporting'

function Guard({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"  element={<Dashboard />} />
        <Route path="tickets"    element={<Tickets />} />
        <Route path="scanner"    element={<Scanner />} />
        <Route path="kasse"      element={<Kasse />} />
        <Route path="equipment"  element={<Equipment />} />
        <Route path="staff"      element={<Staff />} />
        <Route path="program"    element={<Program />} />
        <Route path="livestream" element={<Livestream />} />
        <Route path="reporting"  element={<Reporting />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
