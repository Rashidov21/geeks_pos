import { useState } from 'react'
import { LoginPage } from './pages/LoginPage'
import { PosPage } from './pages/PosPage'

export default function App() {
  const [authed, setAuthed] = useState(false)

  if (!authed) {
    return <LoginPage onDone={() => setAuthed(true)} />
  }
  return <PosPage onLogout={() => setAuthed(false)} />
}
