import { Component, useEffect, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppProvider, useApp } from '@/lib/app-context'
import { Layout } from '@/components/layout/Layout'
import { Toaster } from '@/components/ui/toast'
import { Loading } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import Home from '@/routes/Home'
import NewContent from '@/routes/NewContent'
import ContentList from '@/routes/ContentList'
import ContentEditor from '@/routes/ContentEditor'
import Plan from '@/routes/Plan'
import Keywords from '@/routes/Keywords'
import SiteHealth from '@/routes/SiteHealth'
import Images from '@/routes/Images'
import Settings from '@/routes/Settings'
import SetupWizard from '@/routes/SetupWizard'

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    // Details go to the developer console only; the UI shows plain English.
    console.error(error)
  }
  render() {
    if (this.state.failed)
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
          <h1 className="text-xl font-semibold">This screen hit a problem.</h1>
          <p className="max-w-md text-muted-foreground">
            Your work is saved. Go back to Home and try again. If it keeps happening, use Settings &gt; About
            &gt; Export logs and report it.
          </p>
          <Button
            onClick={() => {
              this.setState({ failed: false })
              window.location.hash = '#/'
            }}
          >
            Back to Home
          </Button>
        </div>
      )
    return this.props.children
  }
}

/** Lets the main process ask the UI to open a screen (e.g. from a notification). */
function NavigateBridge() {
  const nav = useNavigate()
  useEffect(() => window.api.on('navigate', (p) => typeof p === 'string' && nav(p)), [nav])
  return null
}

function Gate() {
  const { ready, settings, sites } = useApp()
  if (!ready || !settings) return <Loading label="Starting…" />
  const needSetup = !settings.firstRunDone || sites.length === 0
  return (
    <Routes>
      <Route path="/setup" element={<SetupWizard />} />
      {needSetup ? (
        <Route path="*" element={<Navigate to="/setup" replace />} />
      ) : (
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<NewContent />} />
          <Route path="/new/:contentId" element={<NewContent />} />
          <Route path="/content" element={<ContentList />} />
          <Route path="/content/:id" element={<ContentEditor />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/keywords" element={<Keywords />} />
          <Route path="/health" element={<SiteHealth />} />
          <Route path="/images" element={<Images />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/:tab" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <HashRouter>
          <NavigateBridge />
          <Gate />
        </HashRouter>
        <Toaster />
      </AppProvider>
    </ErrorBoundary>
  )
}
