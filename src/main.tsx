import { StrictMode } from 'react'
import {Component, type ErrorInfo, type ReactNode} from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AuthGate from './components/AuthGate.tsx'
import {captureDiagnostic, installDiagnostics} from './diagnostics.ts'

class DiagnosticErrorBoundary extends Component<{userId: string; children: ReactNode}, {failed: boolean}> {
  state = {failed: false}
  static getDerivedStateFromError() { return {failed: true} }
  componentDidCatch(error: Error, info: ErrorInfo) {
    captureDiagnostic(this.props.userId, {type: 'runtime', category:'react-render', severity:'critical', message: `Errore nell’interfaccia: ${error.name}: ${error.message}`, route: window.location.pathname, component: info.componentStack?.split('\n').slice(0, 5).join(' ') || 'React tree', stack: error.stack || ''})
  }
  render() {
    if (this.state.failed) return <main role="alert" style={{padding: 32, color: '#29445d'}}><h1>FolderRocket ha incontrato un errore</h1><p>L’evento è stato registrato in Diagnostica. Ricarica la pagina per riprovare.</p><button type="button" onClick={() => window.location.reload()}>Ricarica FolderRocket</button></main>
    return this.props.children
  }
}

installDiagnostics('startup')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
  <DiagnosticErrorBoundary userId="startup"><AuthGate>{session => { installDiagnostics(session.user.id); return <DiagnosticErrorBoundary userId={session.user.id}><App user={session.user} onLogout={session.logout} /></DiagnosticErrorBoundary> }}</AuthGate></DiagnosticErrorBoundary>
  </StrictMode>,
)
