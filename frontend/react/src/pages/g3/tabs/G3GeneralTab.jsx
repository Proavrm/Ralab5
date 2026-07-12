import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import { G3_MISSION_STATUS_OPTIONS, G3_MISSION_TYPE_OPTIONS } from '@/lib/g3/g3Catalogs'

function FG({ label, children, full }) {
  return (
    <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      {label && <label className="text-[10px] font-medium text-text-muted">{label}</label>}
      {children}
    </div>
  )
}

function TA({ value, onChange, rows = 3, placeholder }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full px-3 py-1.5 border border-border rounded text-sm bg-bg outline-none focus:border-nge resize-y"
    />
  )
}

export default function G3GeneralTab({ mission, catalogs, onSave, saving, saveMessage }) {
  const [form, setForm] = useState(() => buildForm(mission))
  const missionIdRef = useRef(mission?.id)

  useEffect(() => {
    if (mission?.id !== missionIdRef.current) {
      missionIdRef.current = mission?.id
      setForm(buildForm(mission))
    }
  }, [mission])

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleMissionType(type) {
    setForm((prev) => {
      const set = new Set(prev.mission_types || [])
      if (set.has(type)) set.delete(type)
      else set.add(type)
      return { ...prev, mission_types: [...set] }
    })
  }

  function handleSave() {
    onSave?.({
      title: form.title,
      client: form.client,
      chantier: form.chantier,
      location: form.location,
      status: form.status,
      mission_types: form.mission_types,
      description: form.description,
      main_objective: form.main_objective,
      conducteur: form.conducteur,
      chef_chantier: form.chef_chantier,
      rst_responsible: form.rst_responsible,
      laboratoire: form.laboratoire,
      lab_intervenant: form.lab_intervenant,
      geotechnicien_externe: form.geotechnicien_externe,
      moa: form.moa,
      moe: form.moe,
      bureau_controle: form.bureau_controle,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    })
  }

  const statusOptions = catalogs?.mission_status || G3_MISSION_STATUS_OPTIONS
  const typeOptions = catalogs?.mission_types || G3_MISSION_TYPE_OPTIONS

  return (
    <div className="space-y-4">
      <SectionCard
        title="Identification"
        actions={(
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        )}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FG label="Référence affaire"><Input value={mission?.affaire_ref || ''} readOnly /></FG>
          <FG label="Référence mission G3"><Input value={mission?.reference || ''} readOnly /></FG>
          <FG label="Demande liée"><Input value={mission?.demande_ref || ''} readOnly /></FG>
          <FG label="Statut mission">
            <Select value={form.status} onChange={(e) => setField('status', e.target.value)}>
              {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FG>
          <FG label="Titre du projet" full>
            <Input value={form.title} onChange={(e) => setField('title', e.target.value)} />
          </FG>
          <FG label="Client"><Input value={form.client} onChange={(e) => setField('client', e.target.value)} /></FG>
          <FG label="Chantier"><Input value={form.chantier} onChange={(e) => setField('chantier', e.target.value)} /></FG>
          <FG label="Adresse / localisation" full>
            <Input value={form.location} onChange={(e) => setField('location', e.target.value)} />
          </FG>
          <FG label="Date de création"><Input value={(mission?.created_at || '').slice(0, 10)} readOnly /></FG>
          <FG label="Date de démarrage prévue">
            <Input type="date" value={form.start_date || ''} onChange={(e) => setField('start_date', e.target.value)} />
          </FG>
          <FG label="Date de fin prévue">
            <Input type="date" value={form.end_date || ''} onChange={(e) => setField('end_date', e.target.value)} />
          </FG>
        </div>
      </SectionCard>

      <SectionCard title="Intervenants">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FG label="Conducteur de travaux"><Input value={form.conducteur} onChange={(e) => setField('conducteur', e.target.value)} /></FG>
          <FG label="Chef de chantier"><Input value={form.chef_chantier} onChange={(e) => setField('chef_chantier', e.target.value)} /></FG>
          <FG label="RST responsable"><Input value={form.rst_responsible} onChange={(e) => setField('rst_responsible', e.target.value)} /></FG>
          <FG label="Laboratoire concerné"><Input value={form.laboratoire} onChange={(e) => setField('laboratoire', e.target.value)} /></FG>
          <FG label="Intervenant laboratoire"><Input value={form.lab_intervenant} onChange={(e) => setField('lab_intervenant', e.target.value)} /></FG>
          <FG label="Géotechnicien externe"><Input value={form.geotechnicien_externe} onChange={(e) => setField('geotechnicien_externe', e.target.value)} /></FG>
          <FG label="MOA"><Input value={form.moa} onChange={(e) => setField('moa', e.target.value)} /></FG>
          <FG label="MOE"><Input value={form.moe} onChange={(e) => setField('moe', e.target.value)} /></FG>
          <FG label="Bureau de contrôle"><Input value={form.bureau_controle} onChange={(e) => setField('bureau_controle', e.target.value)} /></FG>
        </div>
      </SectionCard>

      <SectionCard
        title="Type de mission G3"
        actions={(
          <div className="flex items-center gap-2">
            {saveMessage ? <span className="text-[11px] font-bold text-[#0f6e56]">{saveMessage}</span> : null}
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        )}
      >
        <div className="flex flex-wrap gap-2">
          {typeOptions.map((type) => {
            const checked = (form.mission_types || []).includes(type)
            return (
              <button
                key={type}
                type="button"
                disabled={saving}
                onClick={() => toggleMissionType(type)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[12px] font-bold transition-colors ${checked ? 'border-[#003170] bg-[#e6f1fb] text-[#003170]' : 'border-[#dbe1ea] bg-white text-[#69758a] hover:border-[#003170]/40'}`}
              >
                {type}
              </button>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Cadrage"
        actions={(
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <FG label="Résumé de la demande" full>
            <TA value={form.description} onChange={(v) => setField('description', v)} rows={4} />
          </FG>
          <FG label="Objectif principal de la mission" full>
            <TA value={form.main_objective} onChange={(v) => setField('main_objective', v)} rows={3} />
          </FG>
        </div>
      </SectionCard>
    </div>
  )
}

function buildForm(mission) {
  return {
    title: mission?.title || '',
    client: mission?.client || '',
    chantier: mission?.chantier || '',
    location: mission?.location || '',
    status: mission?.status || 'À préparer',
    mission_types: mission?.mission_types || [],
    description: mission?.description || '',
    main_objective: mission?.main_objective || '',
    conducteur: mission?.conducteur || '',
    chef_chantier: mission?.chef_chantier || '',
    rst_responsible: mission?.rst_responsible || '',
    laboratoire: mission?.laboratoire || '',
    lab_intervenant: mission?.lab_intervenant || '',
    geotechnicien_externe: mission?.geotechnicien_externe || '',
    moa: mission?.moa || '',
    moe: mission?.moe || '',
    bureau_controle: mission?.bureau_controle || '',
    start_date: mission?.start_date || '',
    end_date: mission?.end_date || '',
  }
}
