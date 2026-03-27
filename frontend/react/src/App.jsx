import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'

// Pages (importação lazy para melhor performance)
import { lazy, Suspense } from 'react'

const DashboardPage       = lazy(() => import('@/pages/DashboardPage'))
const AffairesPage        = lazy(() => import('@/pages/AffairesPage'))
const AffairePage         = lazy(() => import('@/pages/AffairePage'))
const DemandesPage        = lazy(() => import('@/pages/DemandesPage'))
const DemandePage         = lazy(() => import('@/pages/DemandePage'))
const PassationsPage      = lazy(() => import('@/pages/PassationsPage'))
const PassationPage       = lazy(() => import('@/pages/PassationPage'))
const DstPage             = lazy(() => import('@/pages/DstPage'))
const PlanningPage        = lazy(() => import('@/pages/PlanningPage'))
const InterventionPage    = lazy(() => import('@/pages/InterventionPage'))
const EssaiPage           = lazy(() => import('@/pages/EssaiPage'))
const QualitePage         = lazy(() => import('@/pages/QualitePage'))
const AdminPage           = lazy(() => import('@/pages/AdminPage'))
const ToolsPage           = lazy(() => import('@/pages/ToolsPage'))

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full text-text-muted text-sm">
      Chargement…
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={
          <Suspense fallback={<PageLoader />}>
            <DashboardPage />
          </Suspense>
        } />
        <Route path="affaires" element={
          <Suspense fallback={<PageLoader />}>
            <AffairesPage />
          </Suspense>
        } />
        <Route path="affaires/:uid" element={
          <Suspense fallback={<PageLoader />}>
            <AffairePage />
          </Suspense>
        } />
        <Route path="demandes" element={
          <Suspense fallback={<PageLoader />}>
            <DemandesPage />
          </Suspense>
        } />
        <Route path="demandes/:uid" element={
          <Suspense fallback={<PageLoader />}>
            <DemandePage />
          </Suspense>
        } />
        <Route path="passations" element={
          <Suspense fallback={<PageLoader />}>
            <PassationsPage />
          </Suspense>
        } />
        <Route path="passations/:uid" element={
          <Suspense fallback={<PageLoader />}>
            <PassationPage />
          </Suspense>
        } />
        <Route path="dst" element={
          <Suspense fallback={<PageLoader />}>
            <DstPage />
          </Suspense>
        } />
        <Route path="planning" element={
          <Suspense fallback={<PageLoader />}>
            <PlanningPage />
          </Suspense>
        } />
        <Route path="interventions/:uid" element={
          <Suspense fallback={<PageLoader />}>
            <InterventionPage />
          </Suspense>
        } />
        <Route path="essais/:uid" element={
          <Suspense fallback={<PageLoader />}>
            <EssaiPage />
          </Suspense>
        } />
        <Route path="qualite" element={
          <Suspense fallback={<PageLoader />}>
            <QualitePage />
          </Suspense>
        } />
        <Route path="admin" element={
          <Suspense fallback={<PageLoader />}>
            <AdminPage />
          </Suspense>
        } />
        <Route path="tools" element={
          <Suspense fallback={<PageLoader />}>
            <ToolsPage />
          </Suspense>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
