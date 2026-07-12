import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { getEssaiModeleDefinition } from '@/lib/essaiModeleCatalog'
import { resolveReturnTo } from '@/lib/detailNavigation'
import { WorksheetMain, WorksheetPageShell, WorksheetTopbar } from '@/components/layout/FicheLayout'

const FIELD_LABELS = {
  point: 'Point / repère',
  localisation: 'Localisation',
  materiau: 'Matériau',
  prelevement_ref: 'Réf. prélèvement',
  laboratoire: 'Laboratoire',
  resultat: 'Résultat',
  observations: 'Observations',
  support: 'Support',
  valeur_mpa: 'Valeur (MPa)',
  methode: 'Méthode',
  valeur_db: 'Valeur (dB)',
  centrale: 'Centrale',
  formulation: 'Formulation',
  temperature_fabrication: 'Température fabrication (°C)',
  tonnage: 'Tonnage',
  densite: 'Densité',
  compacite: 'Compacité (%)',
  vides: 'Vides (%)',
  deflexion_mm: 'Déflexion (mm)',
  temperature_c: 'Température (°C)',
  echantillon_ref: 'Réf. échantillon',
  liant_percent: 'Teneur en liant (%)',
  granulometrie: 'Granulométrie',
  energie: 'Énergie',
  profondeur_mm: 'Profondeur (mm)',
  trace: 'Trace',
  profondeur_m: 'Profondeur (m)',
  charge_kn: 'Charge (kN)',
  valeur: 'Valeur mesurée',
}

function storageKey(code, essaiId) {
  return `ralab5:modele-essai:${code}:${essaiId || 'draft'}`
}

export default function ModeleEssaiBasePage() {
  const navigate = useNavigate()
  const { code = 'GEN' } = useParams()
  const [searchParams] = useSearchParams()
  const definition = useMemo(() => getEssaiModeleDefinition(code), [code])
  const essaiId = String(searchParams.get('essai_id') || searchParams.get('source_uid') || 'draft').trim()
  const returnTo = resolveReturnTo(searchParams.get('return_to'), '/labo/workbench?tab=essais')
  const [values, setValues] = useState({})
  const [savedAt, setSavedAt] = useState('')

  useEffect(() => {
    const fields = definition.fields || ['point', 'localisation', 'resultat', 'observations']
    const initial = Object.fromEntries(fields.map((field) => [field, '']))
    try {
      const raw = window.localStorage.getItem(storageKey(definition.code, essaiId))
      if (raw) {
        const parsed = JSON.parse(raw)
        setValues({ ...initial, ...(parsed?.values || {}) })
        setSavedAt(parsed?.saved_at || '')
        return
      }
    } catch {
      // ignore invalid draft
    }
    setValues(initial)
    setSavedAt('')
  }, [definition, essaiId])

  function setField(key, value) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function handleSave() {
    const payload = { values, saved_at: new Date().toISOString() }
    window.localStorage.setItem(storageKey(definition.code, essaiId), JSON.stringify(payload))
    setSavedAt(payload.saved_at)
  }

  const fields = definition.fields || ['point', 'localisation', 'resultat', 'observations']

  return (
    <WorksheetPageShell>
      <WorksheetTopbar
        backLabel="← Retour"
        onBack={() => navigate(returnTo)}
        eyebrow={`Modèle essai · ${definition.code}`}
        title={definition.label}
      >
        <span className="inline-flex items-center rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] font-bold text-text-muted">
          {definition.status === 'base' ? 'Modèle de base' : definition.status}
        </span>
        <Button size="sm" onClick={handleSave}>Enregistrer brouillon</Button>
      </WorksheetTopbar>

      <WorksheetMain className="max-w-[960px] gap-4 py-6">
        <section className="overflow-hidden rounded-[18px] border border-[#dbe1ea] bg-white shadow-[0_6px_22px_rgba(0,49,112,0.06)]">
          <div className="border-b border-[#e5e9f0] px-5 py-3" style={{ background: 'linear-gradient(90deg, #f8fafc 0%, #f8fafc 78%, #fff6cf 100%)' }}>
            <div className="text-[13px] font-black uppercase tracking-[.12em] text-[#003170]">Feuille {definition.code}</div>
            <div className="mt-1 text-[12px] text-[#69758a]">
              Modèle JSX générique — structure prête pour saisie terrain/labo. Essai #{essaiId}.
            </div>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            {fields.map((field) => (
              <div key={field} className={field === 'observations' ? 'md:col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
                <label className="text-[11px] font-medium text-text-muted">{FIELD_LABELS[field] || field}</label>
                {field === 'observations' ? (
                  <textarea
                    value={values[field] || ''}
                    onChange={(event) => setField(field, event.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge resize-y"
                  />
                ) : (
                  <Input value={values[field] || ''} onChange={(event) => setField(field, event.target.value)} />
                )}
              </div>
            ))}
          </div>
        </section>

        {savedAt ? (
          <div className="rounded-[14px] border border-[#b6d98b] bg-[#eaf3de] px-4 py-3 text-[13px] text-[#3b6d11]">
            Brouillon enregistré localement — {new Date(savedAt).toLocaleString('fr-FR')}
          </div>
        ) : null}
      </WorksheetMain>
    </WorksheetPageShell>
  )
}
