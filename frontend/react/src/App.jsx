import { Routes, Route, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
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
import RapportDEPage from "./pages/rapports/RapportDEPage";
import RapportSCPage from "./pages/rapports/RapportSCPage";
import RapportPMTPage from "./pages/rapports/RapportPMTPage";
import RapportSOPage from "./pages/rapports/RapportSOPage";
import RapportVisiteChantierPage from "./pages/rapports/RapportVisiteChantierPage";
import RapportSituationItinerairePage from "./pages/rapports/RapportSituationItinerairePage";


const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ResponsableLaboDashboardPage = lazy(() => import('@/pages/ResponsableLaboDashboardPage'))
const TechnicianDashboardPage = lazy(() => import('@/pages/TechnicianDashboardPage'))
const LaboHomePage = lazy(() => import('@/pages/LaboHomePage'))
const AffairesPage = lazy(() => import('@/pages/AffairesPage'))
const AffairePage = lazy(() => import('@/pages/AffairePage'))
const AffaireContactsPage = lazy(() => import('@/pages/AffaireContactsPage'))
const ContactsPage = lazy(() => import('@/pages/ContactsPage'))
const DemandesPage = lazy(() => import('@/pages/DemandesPage'))
const DemandePage = lazy(() => import('@/pages/DemandePage'))
const CampaignPage = lazy(() => import('@/pages/CampaignPage'))
const CampagnesPage = lazy(() => import('@/pages/CampagnesPage'))
const PassationsPage = lazy(() => import('@/pages/PassationsPage'))
const PassationPage = lazy(() => import('@/pages/PassationPage'))
const DstPage = lazy(() => import('@/pages/DstPage'))
const DstDetailPage = lazy(() => import('@/pages/DstDetailPage'))
const AffairesNgePage = lazy(() => import('@/pages/AffairesNgePage'))
const EtudesPage = lazy(() => import('@/pages/EtudesPage'))
const PlanningPage = lazy(() => import('@/pages/PlanningPage'))
const LaboWorkbenchPage = lazy(() => import('@/pages/LaboPage'))
const QualitePage = lazy(() => import('@/pages/QualitePage'))
const QsseAnalysisPage = lazy(() => import('@/pages/QsseAnalysisPage'))
const QsseDocumentPreviewPage = lazy(() => import('@/pages/QsseDocumentPreviewPage'))
const InterventionPage = lazy(() => import('@/pages/InterventionPage'))
const InterventionsPage = lazy(() => import('@/pages/InterventionsPage'))
const EssaiPage = lazy(() => import('@/pages/EssaiPage'))
const PrelevementsPage = lazy(() => import('@/pages/PrelevementsPage'))
const PrelevementPage = lazy(() => import('@/pages/PrelevementPage'))
const PrelevementLabelsPage = lazy(() => import('@/pages/PrelevementLabelsPage'))
const ToolsPage = lazy(() => import('@/pages/ToolsPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const EssaiDetailPage = lazy(() => import('@/pages/EssaiDetailPage'))
const EchantillonPage = lazy(() => import('@/pages/EchantillonPage'))
const PlanImplantationPage = lazy(() => import('@/pages/PlanImplantationPage'))
const PlanImplantationCanvasPage = lazy(() => import('@/pages/PlanImplantationCanvasPage'))
const PlanImagesViewPage = lazy(() => import('@/pages/PlanImagesViewPage'))
const NivellementPage = lazy(() => import('@/pages/NivellementPage'))
const FeuilleTerrainPage = lazy(() => import('@/pages/FeuilleTerrainPage'))
const ModeleDEPage = lazy(() => import('@/pages/modeles/ModeleDEPage'))
const ModelePMTPage = lazy(() => import('@/pages/modeles/ModelePMTPage'))
const ModeleSCPage = lazy(() => import('@/pages/modeles/ModeleSCPage'))
const ModeleEssaiBasePage = lazy(() => import('@/pages/modeles/ModeleEssaiBasePage'))
const NoteTechniquePage = lazy(() => import('@/pages/NoteTechniquePage'))
const AvisTechniquePage = lazy(() => import('@/pages/AvisTechniquePage'))
const AvisTechniquePreviewPage = lazy(() => import('@/pages/AvisTechniquePreviewPage'))
const AvisTemplatesAdminPage = lazy(() => import('@/pages/AvisTemplatesAdminPage'))
const FicheCalculPage = lazy(() => import('@/pages/FicheCalculPage'))
const CalculsPage = lazy(() => import('@/pages/CalculsPage'))
const CalculAlizePage = lazy(() => import('@/pages/CalculAlizePage'))
const ModeleVisiteChantierPage = lazy(() => import('@/pages/modeles/ModeleVisiteChantierPage'))
const G3Page = lazy(() => import('@/pages/G3Page'))
const G3MissionListPage = lazy(() => import('@/pages/g3/G3MissionListPage'))
const G3MissionPage = lazy(() => import('@/pages/g3/G3MissionPage'))
const NotesTechniquesPage = lazy(() => import('@/pages/NotesTechniquesPage'))
const TerrainEssaiPage = lazy(() => import('@/pages/modeles/TerrainEssaiPage'))
const TerrainEssaiRapportPage = lazy(() => import('@/pages/rapports/TerrainEssaiRapportPage'))
const FeuillePldPage = lazy(() => import('@/pages/modeles/FeuillePldPage'))
const FeuillePlPage = lazy(() => import('@/pages/modeles/FeuillePlPage'))
const FeuilleDfPage = lazy(() => import('@/pages/modeles/FeuilleDfPage'))
const FeuilleFwdPage = lazy(() => import('@/pages/modeles/FeuilleFwdPage'))
const RapportPldPage = lazy(() => import('@/pages/rapports/RapportPldPage'))
const RapportPlPage = lazy(() => import('@/pages/rapports/RapportPlPage'))
const RapportDfPage = lazy(() => import('@/pages/rapports/RapportDfPage'))
const RapportFwdPage = lazy(() => import('@/pages/rapports/RapportFwdPage'))
const FeuilleMvaPage = lazy(() => import('@/pages/modeles/FeuilleMvaPage'))
const ModeleCFEPage = lazy(() => import('@/pages/modeles/ModeleCFEPage'))
const FeuilleElPage = lazy(() => import('@/pages/modeles/FeuilleElPage'))
const FeuilleWePage = lazy(() => import('@/pages/modeles/FeuilleWePage'))
const FeuilleGrPage = lazy(() => import('@/pages/modeles/FeuilleGrPage'))
const FeuilleLcpPage = lazy(() => import('@/pages/modeles/FeuilleLcpPage'))
const FeuilleVbsPage = lazy(() => import('@/pages/modeles/FeuilleVbsPage'))
const FeuilleMbPage = lazy(() => import('@/pages/modeles/FeuilleMbPage'))
const FeuilleMbfPage = lazy(() => import('@/pages/modeles/FeuilleMbfPage'))
const FeuilleIdPage = lazy(() => import('@/pages/modeles/FeuilleIdPage'))
const FeuillePnPage = lazy(() => import('@/pages/modeles/FeuillePnPage'))
const FeuilleIpiPage = lazy(() => import('@/pages/modeles/FeuilleIpiPage'))
const FeuilleCbriPage = lazy(() => import('@/pages/modeles/FeuilleCbriPage'))
const FeuilleCbrPage = lazy(() => import('@/pages/modeles/FeuilleCbrPage'))
const FeuilleEsPage = lazy(() => import('@/pages/modeles/FeuilleEsPage'))
const FeuilleTxPage = lazy(() => import('@/pages/modeles/FeuilleTxPage'))
const FeuillePhPage = lazy(() => import('@/pages/modeles/FeuillePhPage'))
const FeuilleMoPage = lazy(() => import('@/pages/modeles/FeuilleMoPage'))
const FeuilleCaPage = lazy(() => import('@/pages/modeles/FeuilleCaPage'))
const RapportMvaPage = lazy(() => import('@/pages/rapports/RapportMvaPage'))
const RapportCFEPage = lazy(() => import('@/pages/rapports/RapportCFEPage'))
const RapportElPage = lazy(() => import('@/pages/rapports/RapportElPage'))
const RapportWePage = lazy(() => import('@/pages/rapports/RapportWePage'))
const RapportGrPage = lazy(() => import('@/pages/rapports/RapportGrPage'))
const RapportLcpPage = lazy(() => import('@/pages/rapports/RapportLcpPage'))
const RapportVbsPage = lazy(() => import('@/pages/rapports/RapportVbsPage'))
const RapportMbPage = lazy(() => import('@/pages/rapports/RapportMbPage'))
const RapportMbfPage = lazy(() => import('@/pages/rapports/RapportMbfPage'))
const RapportIdPage = lazy(() => import('@/pages/rapports/RapportIdPage'))
const RapportPnPage = lazy(() => import('@/pages/rapports/RapportPnPage'))
const RapportIpiPage = lazy(() => import('@/pages/rapports/RapportIpiPage'))
const RapportCbriPage = lazy(() => import('@/pages/rapports/RapportCbriPage'))
const RapportCbrPage = lazy(() => import('@/pages/rapports/RapportCbrPage'))
const RapportEsPage = lazy(() => import('@/pages/rapports/RapportEsPage'))
const RapportTxPage = lazy(() => import('@/pages/rapports/RapportTxPage'))
const RapportPhPage = lazy(() => import('@/pages/rapports/RapportPhPage'))
const RapportMoPage = lazy(() => import('@/pages/rapports/RapportMoPage'))
const RapportCaPage = lazy(() => import('@/pages/rapports/RapportCaPage'))
const RapportTvPage = lazy(() => import('@/pages/rapports/RapportTvPage'))
const ValiderRapportsPage = lazy(() => import('@/pages/modeles/valider_rapports_page'))
const LaboratoiresAdminMockupPage = lazy(() => import('@/pages/mockups/LaboratoiresAdminMockupPage'))


function DemandePlanImagesPage() {
  return <PlanImagesViewPage scope="demande" />
}

function CampaignPlanImagesPage() {
  return <PlanImagesViewPage scope="campagne" />
}

function InterventionPlanImagesPage() {
  return <PlanImagesViewPage scope="intervention" />
}

function RedirectDeRuntimeLegacy() {
    const { uid = '' } = useParams()
    const [searchParams] = useSearchParams()
    const returnTo = String(searchParams.get('return_to') || '').trim()
    const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''
    return <Navigate to={`/modeles/de/${encodeURIComponent(uid)}${query}`} replace />
}

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

function RedirectLegacyModeleNt() {
  const { search } = useLocation()
  return <Navigate to={`/g3/notes-techniques/nouveau${search}`} replace />
}

function RedirectLegacyNtRedaction() {
  const [searchParams] = useSearchParams()
  const interventionId = String(searchParams.get('intervention_id') || '').trim()
  const demandeId = String(searchParams.get('demande_id') || '').trim()
  const demandeRef = String(searchParams.get('demande_ref') || '').trim()
  const returnTo = String(searchParams.get('return_to') || '').trim()
  const params = new URLSearchParams()
  if (returnTo) params.set('return_to', returnTo)
  const query = params.toString()

  if (interventionId) {
    return <Navigate to={`/g3/notes-techniques/${encodeURIComponent(interventionId)}${query ? `?${query}` : ''}`} replace />
  }

  const createParams = new URLSearchParams()
  if (demandeId) createParams.set('demande_id', demandeId)
  if (demandeRef) createParams.set('demande_ref', demandeRef)
  if (returnTo) createParams.set('return_to', returnTo)
  return <Navigate to={`/g3/notes-techniques/nouveau?${createParams.toString()}`} replace />
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
                <Route path="contacts" element={<P><ContactsPage /></P>} />
                <Route path="affaires/:uid/contacts" element={<P><AffaireContactsPage /></P>} />
                <Route path="affaires/:uid" element={<P><AffairePage /></P>} />
                <Route path="demandes" element={<P><DemandesPage /></P>} />
                <Route path="demandes/:uid" element={<P><DemandePage /></P>} />
                <Route path="demandes/:uid/plans" element={<P><DemandePlanImagesPage /></P>} />
                <Route path="campagnes" element={<P><CampagnesPage /></P>} />
                <Route path="campagnes/:uid" element={<P><CampaignPage /></P>} />
                <Route path="campagnes/:uid/plans" element={<P><CampaignPlanImagesPage /></P>} />
                <Route path="passations" element={<P><PassationsPage /></P>} />
                <Route path="passations/:uid" element={<P><PassationPage /></P>} />
                <Route path="dst" element={<P><DstPage /></P>} />
                <Route path="dst/:uid" element={<P><DstDetailPage /></P>} />
                <Route path="affaires-nge" element={<P><AffairesNgePage /></P>} />
                <Route path="etudes" element={<P><EtudesPage /></P>} />
                <Route path="planning" element={<P><PlanningPage /></P>} />
                <Route path="labo" element={<P><LaboHomePage /></P>} />
                <Route path="labo/workbench" element={<P><LaboWorkbenchPage /></P>} />
                <Route path="prelevements" element={<P><PrelevementsPage /></P>} />
                <Route path="prelevements/etiquettes" element={<P><PrelevementLabelsPage /></P>} />
                <Route path="prelevements/:uid" element={<P><PrelevementPage /></P>} />
                <Route path="qualite" element={<P><QualitePage /></P>} />
                <Route path="qualite/qsse/analyse" element={<P><QsseAnalysisPage /></P>} />
                <Route path="qualite/qsse/documents/view" element={<P><QsseDocumentPreviewPage /></P>} />
                <Route path="interventions" element={<P><InterventionsPage /></P>} />
                <Route path="interventions/:uid" element={<P><InterventionPage /></P>} />
                <Route path="interventions/:uid/plans" element={<P><InterventionPlanImagesPage /></P>} />
                <Route path="essais/:uid" element={<P><EssaiPage /></P>} />
                <Route path="echantillons/:uid" element={<P><EchantillonPage /></P>} />
                <Route path="essai/:uid" element={<P><EssaiDetailPage /></P>} />
                <Route path="plans-implantation/:uid" element={<P><PlanImplantationPage /></P>} />
                <Route path="plans-implantation/:uid/canvas" element={<P><PlanImplantationCanvasPage /></P>} />
                <Route path="nivellements/:uid" element={<P><NivellementPage /></P>} />
                <Route path="feuilles-terrain/vc/:uid" element={<P><ModeleVisiteChantierPage /></P>} />
                <Route path="feuilles-terrain/de/:uid/runtime" element={<RedirectDeRuntimeLegacy />} />
                <Route path="modeles/de/:uid" element={<P><ModeleDEPage /></P>} />
                <Route path="modeles/pld/:uid" element={<P><FeuillePldPage /></P>} />
                <Route path="modeles/pld" element={<P><FeuillePldPage /></P>} />
                <Route path="modeles/pl/:uid" element={<P><FeuillePlPage /></P>} />
                <Route path="modeles/pl" element={<P><FeuillePlPage /></P>} />
                <Route path="modeles/df/:uid" element={<P><FeuilleDfPage /></P>} />
                <Route path="modeles/df" element={<P><FeuilleDfPage /></P>} />
                <Route path="modeles/fwd/:uid" element={<P><FeuilleFwdPage /></P>} />
                <Route path="modeles/fwd" element={<P><FeuilleFwdPage /></P>} />
                <Route path="feuilles-terrain/:uid" element={<P><FeuilleTerrainPage /></P>} />
                <Route path="modelos-base/:code" element={<Navigate to="/tools" replace />} />
                <Route path="work/de" element={<Navigate to="/tools" replace />} />
                <Route path="modeles/pmt" element={<P><ModelePMTPage /></P>} />
                <Route path="modeles/sc" element={<P><ModeleSCPage /></P>} />
                <Route path="modeles/nt" element={<RedirectLegacyModeleNt />} />
                <Route path="g3" element={<P><G3Page /></P>} />
                <Route path="g3/missions" element={<P><G3MissionListPage /></P>} />
                <Route path="g3/missions/:uid" element={<P><G3MissionPage /></P>} />
                <Route path="g3/fiche-calcul" element={<P><FicheCalculPage /></P>} />
                <Route path="calculs" element={<P><CalculsPage /></P>} />
                <Route path="calculs/alize/:id" element={<P><CalculAlizePage /></P>} />
                <Route path="avis-technique/templates" element={<P><AvisTemplatesAdminPage /></P>} />
                <Route path="avis-technique/nouveau" element={<P><AvisTechniquePage /></P>} />
                <Route path="avis-technique/:id/preview" element={<P><AvisTechniquePreviewPage /></P>} />
                <Route path="avis-technique/:id" element={<P><AvisTechniquePage /></P>} />
                <Route path="g3/notes-techniques" element={<P><NotesTechniquesPage /></P>} />
                <Route path="g3/notes-techniques/nouveau" element={<P><NoteTechniquePage /></P>} />
                <Route path="g3/notes-techniques/:uid" element={<P><NoteTechniquePage /></P>} />
                <Route path="g3/notes-techniques/redaction" element={<RedirectLegacyNtRedaction />} />
                <Route path="modeles/visite-chantier" element={<P><ModeleVisiteChantierPage /></P>} />
                <Route path="modeles/terrain/:code" element={<P><TerrainEssaiPage /></P>} />
                <Route path="modeles/essai/:code" element={<P><ModeleEssaiBasePage /></P>} />
                <Route path="modeles/mva/:uid" element={<P><FeuilleMvaPage /></P>} />
                <Route path="modeles/mva" element={<P><FeuilleMvaPage /></P>} />
                <Route path="modeles/cfe/:uid" element={<P><ModeleCFEPage /></P>} />
                <Route path="modeles/cfe" element={<P><ModeleCFEPage /></P>} />
                <Route path="modeles/el/:uid" element={<P><FeuilleElPage /></P>} />
                <Route path="modeles/el" element={<P><FeuilleElPage /></P>} />
                <Route path="modeles/we/:uid" element={<P><FeuilleWePage /></P>} />
                <Route path="modeles/we" element={<P><FeuilleWePage /></P>} />
                <Route path="modeles/gr/:uid" element={<P><FeuilleGrPage /></P>} />
                <Route path="modeles/gr" element={<P><FeuilleGrPage /></P>} />
                <Route path="modeles/lcp/:uid" element={<P><FeuilleLcpPage /></P>} />
                <Route path="modeles/lcp" element={<P><FeuilleLcpPage /></P>} />
                <Route path="modeles/vbs/:uid" element={<P><FeuilleVbsPage /></P>} />
                <Route path="modeles/vbs" element={<P><FeuilleVbsPage /></P>} />
                <Route path="modeles/mb/:uid" element={<P><FeuilleMbPage /></P>} />
                <Route path="modeles/mb" element={<P><FeuilleMbPage /></P>} />
                <Route path="modeles/mbf/:uid" element={<P><FeuilleMbfPage /></P>} />
                <Route path="modeles/mbf" element={<P><FeuilleMbfPage /></P>} />
                <Route path="modeles/id/:uid" element={<P><FeuilleIdPage /></P>} />
                <Route path="modeles/id" element={<P><FeuilleIdPage /></P>} />
                <Route path="modeles/pn/:uid" element={<P><FeuillePnPage /></P>} />
                <Route path="modeles/pn" element={<P><FeuillePnPage /></P>} />
                <Route path="modeles/ipi/:uid" element={<P><FeuilleIpiPage /></P>} />
                <Route path="modeles/ipi" element={<P><FeuilleIpiPage /></P>} />
                <Route path="modeles/cbri/:uid" element={<P><FeuilleCbriPage /></P>} />
                <Route path="modeles/cbri" element={<P><FeuilleCbriPage /></P>} />
                <Route path="modeles/cbr/:uid" element={<P><FeuilleCbrPage /></P>} />
                <Route path="modeles/cbr" element={<P><FeuilleCbrPage /></P>} />
                <Route path="modeles/es/:uid" element={<P><FeuilleEsPage /></P>} />
                <Route path="modeles/es" element={<P><FeuilleEsPage /></P>} />
                <Route path="modeles/tx/:uid" element={<P><FeuilleTxPage /></P>} />
                <Route path="modeles/tx" element={<P><FeuilleTxPage /></P>} />
                <Route path="modeles/ph/:uid" element={<P><FeuillePhPage /></P>} />
                <Route path="modeles/ph" element={<P><FeuillePhPage /></P>} />
                <Route path="modeles/mo/:uid" element={<P><FeuilleMoPage /></P>} />
                <Route path="modeles/mo" element={<P><FeuilleMoPage /></P>} />
                <Route path="modeles/ca/:uid" element={<P><FeuilleCaPage /></P>} />
                <Route path="modeles/ca" element={<P><FeuilleCaPage /></P>} />
                <Route path="work/pmt" element={<Navigate to="/tools" replace />} />
                <Route path="tools" element={<P><ToolsPage /></P>} />
                <Route path="rapports/validation" element={<P><ValiderRapportsPage /></P>} />
                <Route path="admin" element={<P><AdminPage /></P>} />
                <Route path="mockups/laboratoires-admin" element={<P><LaboratoiresAdminMockupPage /></P>} />
                <Route path="preparations/:uid" element={<P><PreparationPage /></P>} />
                <Route path="preparations-card/:uid" element={<P><PreparationPageCard /></P>} />
                <Route path="interventions-card/:uid" element={<P><InterventionPageCard /></P>} />
                <Route path="instructions-preview" element={<P><InstructionsPage /></P>} />
                <Route path="essais-workbench" element={<P><EssaisInterventionWorkbench /></P>} />
                <Route path="interventions-requalification-2026" element={<P><InterventionsRequalificationWorkbench /></P>} />
                <Route path="/rapports/de/view" element={<RapportDEPage />} />
                <Route path="/rapports/de/:essaiId" element={<RapportDEPage />} />
                <Route path="/rapports/fwd/view" element={<P><RapportFwdPage /></P>} />
                <Route path="/rapports/fwd/:essaiId" element={<P><RapportFwdPage /></P>} />
                <Route path="/rapports/pld/view" element={<P><RapportPldPage /></P>} />
                <Route path="/rapports/pld/:essaiId" element={<P><RapportPldPage /></P>} />
                <Route path="/rapports/pl/view" element={<P><RapportPlPage /></P>} />
                <Route path="/rapports/pl/:essaiId" element={<P><RapportPlPage /></P>} />
                <Route path="/rapports/df/view" element={<P><RapportDfPage /></P>} />
                <Route path="/rapports/df/:essaiId" element={<P><RapportDfPage /></P>} />
                <Route path="/rapports/adh/view" element={<P><TerrainEssaiRapportPage code="ADH" /></P>} />
                <Route path="/rapports/aco/view" element={<P><TerrainEssaiRapportPage code="ACO" /></P>} />
                <Route path="/rapports/pmt/view" element={<RapportPMTPage />} />
                <Route path="/rapports/pmt/:essaiId" element={<RapportPMTPage />} />
                <Route path="/rapports/sc/view" element={<RapportSCPage />} />
                <Route path="/rapports/sc/:essaiId" element={<RapportSCPage />} />
                <Route path="/rapports/so/view" element={<RapportSOPage />} />
                <Route path="/rapports/so/:essaiId" element={<RapportSOPage />} />
                <Route path="/rapports/vc/view" element={<RapportVisiteChantierPage />} />
                <Route path="/rapports/vc/:feuilleUid" element={<RapportVisiteChantierPage />} />
                <Route path="/rapports/mva/view" element={<P><RapportMvaPage /></P>} />
                <Route path="/rapports/mva/:essaiId" element={<P><RapportMvaPage /></P>} />
                <Route path="/rapports/cfe/view" element={<P><RapportCFEPage /></P>} />
                <Route path="/rapports/cfe/:essaiId" element={<P><RapportCFEPage /></P>} />
                <Route path="/rapports/el/view" element={<P><RapportElPage /></P>} />
                <Route path="/rapports/el/:essaiId" element={<P><RapportElPage /></P>} />
                <Route path="/rapports/we/view" element={<P><RapportWePage /></P>} />
                <Route path="/rapports/we/:essaiId" element={<P><RapportWePage /></P>} />
                <Route path="/rapports/gr/view" element={<P><RapportGrPage /></P>} />
                <Route path="/rapports/gr/:essaiId" element={<P><RapportGrPage /></P>} />
                <Route path="/rapports/lcp/view" element={<P><RapportLcpPage /></P>} />
                <Route path="/rapports/lcp/:essaiId" element={<P><RapportLcpPage /></P>} />
                <Route path="/rapports/vbs/view" element={<P><RapportVbsPage /></P>} />
                <Route path="/rapports/vbs/:essaiId" element={<P><RapportVbsPage /></P>} />
                <Route path="/rapports/mb/view" element={<P><RapportMbPage /></P>} />
                <Route path="/rapports/mb/:essaiId" element={<P><RapportMbPage /></P>} />
                <Route path="/rapports/mbf/view" element={<P><RapportMbfPage /></P>} />
                <Route path="/rapports/mbf/:essaiId" element={<P><RapportMbfPage /></P>} />
                <Route path="/rapports/id/view" element={<P><RapportIdPage /></P>} />
                <Route path="/rapports/id/:essaiId" element={<P><RapportIdPage /></P>} />
                <Route path="/rapports/pn/view" element={<P><RapportPnPage /></P>} />
                <Route path="/rapports/pn/:essaiId" element={<P><RapportPnPage /></P>} />
                <Route path="/rapports/ipi/view" element={<P><RapportIpiPage /></P>} />
                <Route path="/rapports/ipi/:essaiId" element={<P><RapportIpiPage /></P>} />
                <Route path="/rapports/cbri/view" element={<P><RapportCbriPage /></P>} />
                <Route path="/rapports/cbri/:essaiId" element={<P><RapportCbriPage /></P>} />
                <Route path="/rapports/cbr/view" element={<P><RapportCbrPage /></P>} />
                <Route path="/rapports/cbr/:essaiId" element={<P><RapportCbrPage /></P>} />
                <Route path="/rapports/es/view" element={<P><RapportEsPage /></P>} />
                <Route path="/rapports/es/:essaiId" element={<P><RapportEsPage /></P>} />
                <Route path="/rapports/tx/view" element={<P><RapportTxPage /></P>} />
                <Route path="/rapports/tx/:essaiId" element={<P><RapportTxPage /></P>} />
                <Route path="/rapports/ph/view" element={<P><RapportPhPage /></P>} />
                <Route path="/rapports/ph/:essaiId" element={<P><RapportPhPage /></P>} />
                <Route path="/rapports/mo/view" element={<P><RapportMoPage /></P>} />
                <Route path="/rapports/mo/:essaiId" element={<P><RapportMoPage /></P>} />
                <Route path="/rapports/ca/view" element={<P><RapportCaPage /></P>} />
                <Route path="/rapports/ca/:essaiId" element={<P><RapportCaPage /></P>} />
                <Route path="/rapports/tv/view" element={<P><RapportTvPage /></P>} />
                <Route path="/rapports/acces-chantier/:demandeUid" element={<RapportSituationItinerairePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}
