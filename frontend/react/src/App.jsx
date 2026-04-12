import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import { lazy, Suspense } from 'react'
import { getUserHomeRoute } from '@/lib/userHome'
import PreparationPage from '@/pages/PreparationPage'
import PreparationPageCard from '@/pages/PreparationPageCard'
import InterventionPageCard from '@/pages/InterventionPageCard'
import InstructionsPage from '@/pages/InstructionsPage'
import EssaisInterventionWorkbench from '@/pages/EssaisInterventionWorkbench'
import InterventionsRequalificationWorkbench from '@/pages/InterventionsRequalificationWorkbench'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ResponsableLaboDashboardPage = lazy(() => import('@/pages/ResponsableLaboDashboardPage'))
const TechnicianDashboardPage = lazy(() => import('@/pages/TechnicianDashboardPage'))
const LaboHomePage = lazy(() => import('@/pages/LaboHomePage'))
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
const LaboWorkbenchPage = lazy(() => import('@/pages/LaboPage'))
const QualitePage = lazy(() => import('@/pages/QualitePage'))
const InterventionPage = lazy(() => import('@/pages/InterventionPage'))
const EssaiPage = lazy(() => import('@/pages/EssaiPage'))
const PrelevementsPage = lazy(() => import('@/pages/PrelevementsPage'))
const PrelevementPage = lazy(() => import('@/pages/PrelevementPage'))
const PrelevementLabelsPage = lazy(() => import('@/pages/PrelevementLabelsPage'))
const ToolsPage = lazy(() => import('@/pages/ToolsPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const EssaiDetailPage = lazy(() => import('@/pages/EssaiDetailPage'))
const EchantillonPage = lazy(() => import('@/pages/EchantillonPage'))
const PmtRapportPage = lazy(() => import('@/pages/PmtRapportPage'))
const VBSPage = lazy(() => import('@/pages/VBSPage'))


function ProtectedRoute({ children }) {
    const { isAuthenticated } = useAuth()
    if (!isAuthenticated) return <Navigate to="/login" replace />
    return children
}

function P({ children }) {
    return <Suspense fallback={<div className="text-xs text-text-muted text-center py-12">Chargement…</div>}>{children}</Suspense>
}

function HomeRoute() {
    const { user } = useAuth()
    return <Navigate to={getUserHomeRoute(user)} replace />
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<HomeRoute />} />
                <Route path="dashboard" element={<P><DashboardPage /></P>} />
                <Route path="dashboard/labos/:slug" element={<P><ResponsableLaboDashboardPage /></P>} />
                <Route path="dashboard/techniciens/:slug" element={<P><TechnicianDashboardPage /></P>} />
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
                <Route path="labo" element={<P><LaboHomePage /></P>} />
                <Route path="labo/workbench" element={<P><LaboWorkbenchPage /></P>} />
                <Route path="prelevements" element={<P><PrelevementsPage /></P>} />
                <Route path="prelevements/etiquettes" element={<P><PrelevementLabelsPage /></P>} />
                <Route path="prelevements/:uid" element={<P><PrelevementPage /></P>} />
                <Route path="qualite" element={<P><QualitePage /></P>} />
                <Route path="interventions/:uid" element={<P><InterventionPage /></P>} />
                <Route path="essais/:uid" element={<P><EssaiPage /></P>} />
                <Route path="echantillons/:uid" element={<P><EchantillonPage /></P>} />
                <Route path="essai/:uid" element={<P><EssaiDetailPage /></P>} />
                <Route path="pmt/rapports/:uid" element={<P><PmtRapportPage /></P>} />
                <Route path="tools" element={<P><ToolsPage /></P>} />
                <Route path="admin" element={<P><AdminPage /></P>} />
                <Route path="preparations/:uid" element={<P><PreparationPage /></P>} />
                <Route path="preparations-card/:uid" element={<P><PreparationPageCard /></P>} />
                <Route path="interventions-card/:uid" element={<P><InterventionPageCard /></P>} />
                <Route path="instructions-preview" element={<P><InstructionsPage /></P>} />
                <Route path="essais-workbench" element={<P><EssaisInterventionWorkbench /></P>} />
                <Route path="interventions-requalification-2026" element={<P><InterventionsRequalificationWorkbench /></P>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}
