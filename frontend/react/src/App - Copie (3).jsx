import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import { lazy, Suspense } from 'react'
import PreparationPage from '@/pages/PreparationPage'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const AffairesPage = lazy(() => import('@/pages/AffairesPage'))
const AffairePage = lazy(() => import('@/pages/AffairePage'))
const DemandesPage = lazy(() => import('@/pages/DemandesPage'))
const DemandePage = lazy(() => import('@/pages/DemandePage'))
const PassationsPage = lazy(() => import('@/pages/PassationsPage'))
const PassationPage = lazy(() => import('@/pages/PassationPage'))
const DstPage = lazy(() => import('@/pages/DstPage'))
const AffairesNgePage = lazy(() => import('@/pages/AffairesNgePage'))
const EtudesPage = lazy(() => import('@/pages/EtudesPage'))
const PlanningPage = lazy(() => import('@/pages/PlanningPage'))
const LaboPage = lazy(() => import('@/pages/LaboPage'))
const QualitePage = lazy(() => import('@/pages/QualitePage'))
const InterventionPage = lazy(() => import('@/pages/InterventionPage'))
const EssaiPage = lazy(() => import('@/pages/EssaiPage'))
const ToolsPage = lazy(() => import('@/pages/ToolsPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const EssaiDetailPage = lazy(() => import('@/pages/EssaiDetailPage'))

function ProtectedRoute({ children }) {
    const { isAuthenticated } = useAuth()
    if (!isAuthenticated) return <Navigate to="/login" replace />
    return children
}

function P({ children }) {
    return <Suspense fallback={<div className="text-xs text-text-muted text-center py-12">Chargement…</div>}>{children}</Suspense>
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<P><DashboardPage /></P>} />
                <Route path="affaires" element={<P><AffairesPage /></P>} />
                <Route path="affaires/:uid" element={<P><AffairePage /></P>} />
                <Route path="demandes" element={<P><DemandesPage /></P>} />
                <Route path="demandes/:uid" element={<P><DemandePage /></P>} />
                <Route path="passations" element={<P><PassationsPage /></P>} />
                <Route path="passations/:uid" element={<P><PassationPage /></P>} />
                <Route path="dst" element={<P><DstPage /></P>} />
                <Route path="affaires-nge" element={<P><AffairesNgePage /></P>} />
                <Route path="etudes" element={<P><EtudesPage /></P>} />
                <Route path="planning" element={<P><PlanningPage /></P>} />
                <Route path="labo" element={<P><LaboPage /></P>} />
                <Route path="qualite" element={<P><QualitePage /></P>} />
                <Route path="interventions/:uid" element={<P><InterventionPage /></P>} />
                <Route path="essais/:uid" element={<P><EssaiPage /></P>} />
                <Route path="essai/:uid" element={<P><EssaiDetailPage /></P>} />
                <Route path="tools" element={<P><ToolsPage /></P>} />
                <Route path="admin" element={<P><AdminPage /></P>} />
                <Route path="preparations/:uid" element={<P><PreparationPage /></P>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}
