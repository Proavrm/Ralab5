import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import CalculationSheetEditor from '@/components/calcul/CalculationSheetEditor'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import {
  buildEmptySheetValues,
  CALC_TOOLS,
  defaultStudyTypeForTool,
  FICHE_CALCUL_DRAFT_KEY,
  getStudyType,
  listStudyTypesForTool,
  resolveToolForStudyType,
  STUDY_TYPES,
} from '@/lib/calculationSheetCatalog'

const TOOL_ORDER = ['allyze', 'talren']

function loadDraft() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(FICHE_CALCUL_DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function ToolTab({ active, label, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[14px] border px-4 py-3 text-left transition-colors ${
        active
          ? 'border-[#003170] bg-[#003170] text-white shadow-[0_8px_24px_rgba(0,49,112,0.18)]'
          : 'border-[#dbe1ea] bg-white text-[#475569] hover:border-[#5b4b8a] hover:bg-[#f8fafc]'
      }`}
    >
      <div className="text-[14px] font-black">{label}</div>
      <div className={`mt-1 text-[11px] leading-5 ${active ? 'text-white/80' : 'text-[#69758a]'}`}>
        {subtitle}
      </div>
    </button>
  )
}

export default function FicheCalculPage() {
  const navigate = useNavigate()
  const [activeTool, setActiveTool] = useState('allyze')
  const [studyTypeId, setStudyTypeId] = useState('chaussee')
  const [values, setValues] = useState(() => buildEmptySheetValues('chaussee'))
  const [saveInfo, setSaveInfo] = useState('')
  const [hydrated, setHydrated] = useState(false)

  const profile = useMemo(() => getStudyType(studyTypeId), [studyTypeId])
  const toolMeta = CALC_TOOLS[activeTool]
  const studyTypesForTool = useMemo(() => listStudyTypesForTool(activeTool), [activeTool])

  useEffect(() => {
    const draft = loadDraft()
    if (draft?.studyType && draft?.values) {
      const tool = resolveToolForStudyType(draft.studyType)
      setActiveTool(tool)
      setStudyTypeId(draft.studyType)
      setValues(draft.values)
    }
    setHydrated(true)
  }, [])

  function switchTool(toolId) {
    if (toolId === activeTool) return
    const nextStudyType = defaultStudyTypeForTool(toolId)
    setActiveTool(toolId)
    setStudyTypeId(nextStudyType)
    setValues(buildEmptySheetValues(nextStudyType))
    setSaveInfo('')
  }

  function handleStudyTypeChange(nextStudyTypeId) {
    setStudyTypeId(nextStudyTypeId)
    setValues(buildEmptySheetValues(nextStudyTypeId))
    setSaveInfo('')
  }

  function handleSaveDraft() {
    const payload = {
      activeTool,
      studyType: studyTypeId,
      values: { ...values, studyType: studyTypeId, activeTool },
      savedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(FICHE_CALCUL_DRAFT_KEY, JSON.stringify(payload))
    setSaveInfo('Brouillon enregistré localement')
  }

  function handleResetDraft() {
    if (!window.confirm('Effacer le brouillon local et repartir à zéro ?')) return
    window.localStorage.removeItem(FICHE_CALCUL_DRAFT_KEY)
    setActiveTool('allyze')
    setStudyTypeId('chaussee')
    setValues(buildEmptySheetValues('chaussee'))
    setSaveInfo('Brouillon effacé')
  }

  if (!hydrated) {
    return (
      <FichePageShell>
        <FicheMain>
          <div className="text-center text-[13px] text-text-muted py-12">Chargement…</div>
        </FicheMain>
      </FichePageShell>
    )
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← G3"
        onBack={() => navigate('/g3')}
        eyebrow="G3 · Fiche de calcul"
        title="Allyze & Talren"
        subtitle={toolMeta.subtitle}
      >
        <span className="inline-flex items-center rounded-full border border-[#dbe1ea] bg-[#f8fafc] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
          Outil actif : {toolMeta.label}
        </span>
        <Button size="sm" variant="secondary" onClick={handleResetDraft}>
          Réinitialiser
        </Button>
        <Button size="sm" variant="primary" onClick={handleSaveDraft}>
          Enregistrer brouillon
        </Button>
      </FicheTopbar>

      <FicheMain>
        <SectionCard
          title="Choisir l'outil de calcul"
          subtitle="Deux logiciels distincts — paramètres différents"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TOOL_ORDER.map((toolId) => {
              const meta = CALC_TOOLS[toolId]
              return (
                <ToolTab
                  key={toolId}
                  active={activeTool === toolId}
                  label={meta.label}
                  subtitle={meta.subtitle}
                  onClick={() => switchTool(toolId)}
                />
              )
            })}
          </div>
        </SectionCard>

        <SectionCard
          title={`Paramètres ${toolMeta.label}`}
          subtitle="Une fiche — champs activés selon le cas d'étude"
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-medium text-text-muted">Cas d&apos;étude</label>
              <Select
                value={studyTypeId}
                onChange={(event) => handleStudyTypeChange(event.target.value)}
                className="min-w-[280px] text-sm"
              >
                {studyTypesForTool.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </Select>
            </div>
          )}
        >
          <div className="rounded-[12px] border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">Profil</div>
            <div className="mt-1 text-[13px] leading-6 text-[#475569]">{profile.description}</div>
          </div>
          {saveInfo ? (
            <p className="mt-3 text-[12px] text-[#0f6e56]">{saveInfo}</p>
          ) : null}
        </SectionCard>

        <CalculationSheetEditor
          studyTypeId={studyTypeId}
          activeTool={activeTool}
          values={values}
          onChange={setValues}
        />

        <div className="rounded-[16px] border border-[#dbe1ea] bg-[#fff6cf] p-4 text-[12px] leading-6 text-[#8A6410]">
          <strong>Allyze</strong> : chaussées, plateformes, trafic, couches.
          <br />
          <strong>Talren</strong> : taludes, murs, stratigraphie, eau, surcharges, renforts.
          <br />
          Le cadrage affaire / demande reste sur les fiches dossier — pas resaisi ici.
        </div>
      </FicheMain>
    </FichePageShell>
  )
}
