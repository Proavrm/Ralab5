import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { getEssaiModeleDefinition } from '@/lib/essaiModeleCatalog'
import { resolveReturnTo } from '@/lib/detailNavigation'

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
    <div className="flex flex-col h-full -m-6 overflow-y-auto" style={{ background: 'radial-gradient(circle at top right, rgba(255,204,0,0.18), transparent 32%), linear-gradient(180deg, #f8fafc 0%, #f3f6fb 42%, #eef3fa 100%)' }}>
      <div className="sticky top-0 z-10 border-b border-[#dbe1ea] bg-white/95 backdrop-blur px-6 py-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => navigate(returnTo)} className="px-3 py-2 rounded-xl text-[#69758a] text-[13px] font-bold hover:bg-[#f3f6fb]">
          ← Retour
        </button>
        <div className="flex-1 min-w-[220px]">
          <div className="text-[10px] font-black uppercase tracking-[.12em] text-[#8a95a8]">Modèle essai · {definition.code}</div>
          <div className="text-[15px] font-black text-[#003170]">{definition.label}</div>
        </div>
        <span className="inline-flex items-center rounded-full border border-[#dbe1ea] bg-[#f8fafc] px-2.5 py-1 text-[11px] font-bold text-[#69758a]">
          {definition.status === 'base' ? 'Modèle de base' : definition.status}
        </span>
        <Button size="sm" onClick={handleSave}>Enregistrer brouillon</Button>
      </div>

      <div className="mx-auto w-full max-w-[960px] px-6 py-6 flex flex-col gap-4">
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
                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
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
      </div>
    </div>
  )
}
