import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { DIRECT_ESSAI_TEMPLATES } from '@/lib/directEssaiTemplates'

export default function CreateEssaiModal({
  open,
  onClose,
  onConfirm,
  interventions = [],
  echantillons = [],
  defaultInterventionUid = '',
  isSubmitting = false,
}) {
  const [essaiCode, setEssaiCode] = useState('GEN')
  const [targetKind, setTargetKind] = useState('intervention')
  const [interventionUid, setInterventionUid] = useState('')
  const [echantillonUid, setEchantillonUid] = useState('')

  useEffect(() => {
    if (!open) return
    setEssaiCode('GEN')
    setTargetKind(interventions.length ? 'intervention' : 'echantillon')
    setInterventionUid(defaultInterventionUid || String(interventions[0]?.uid || ''))
    setEchantillonUid(String(echantillons[0]?.uid || echantillons[0]?.id || ''))
  }, [open, defaultInterventionUid, interventions, echantillons])

  const selectedIntervention = useMemo(
    () => interventions.find((item) => String(item.uid) === String(interventionUid)) || null,
    [interventions, interventionUid],
  )
  const selectedEchantillon = useMemo(
    () => echantillons.find((item) => String(item.uid || item.id) === String(echantillonUid)) || null,
    [echantillons, echantillonUid],
  )

  const canSubmit = targetKind === 'intervention'
    ? Boolean(selectedIntervention?.uid)
    : Boolean(selectedEchantillon?.uid || selectedEchantillon?.id)

  function handleConfirm() {
    if (!canSubmit) return
    onConfirm?.({
      essaiCode,
      intervention: targetKind === 'intervention' ? selectedIntervention : null,
      echantillon: targetKind === 'echantillon' ? selectedEchantillon : null,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Créer un essai" size="lg">
      <div className="flex flex-col gap-4">
        <div className="rounded-[10px] border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3 text-[13px] text-[#69758a]">
          Choisissez le type d’essai et le rattachement. Les feuilles terrain et essais labo s’ouvrent ensuite dans leur fiche de saisie.
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-text-muted">Type d’essai</label>
          <Select value={essaiCode} onChange={(event) => setEssaiCode(event.target.value)}>
            {DIRECT_ESSAI_TEMPLATES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} — {item.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!interventions.length}
            onClick={() => setTargetKind('intervention')}
            className={`rounded-full px-3 py-1.5 text-[12px] font-bold border ${targetKind === 'intervention' ? 'border-[#003170] bg-[#eef5ff] text-[#003170]' : 'border-[#dbe1ea] text-[#69758a]'}`}
          >
            Sur intervention
          </button>
          <button
            type="button"
            disabled={!echantillons.length}
            onClick={() => setTargetKind('echantillon')}
            className={`rounded-full px-3 py-1.5 text-[12px] font-bold border ${targetKind === 'echantillon' ? 'border-[#003170] bg-[#eef5ff] text-[#003170]' : 'border-[#dbe1ea] text-[#69758a]'}`}
          >
            Sur échantillon labo
          </button>
        </div>

        {targetKind === 'intervention' ? (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-text-muted">Intervention</label>
            {interventions.length ? (
              <Select value={interventionUid} onChange={(event) => setInterventionUid(event.target.value)}>
                {interventions.map((item) => (
                  <option key={item.uid} value={item.uid}>
                    {item.reference || `Intervention #${item.uid}`}
                    {item.sujet ? ` — ${item.sujet}` : ''}
                    {item.campagne_label ? ` (${item.campagne_label})` : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="rounded-[10px] border border-dashed border-[#dbe1ea] px-3 py-2 text-[12px] text-[#69758a]">
                Aucune intervention. Créez d’abord une intervention sur une campagne.
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-text-muted">Échantillon</label>
            {echantillons.length ? (
              <Select value={echantillonUid} onChange={(event) => setEchantillonUid(event.target.value)}>
                {echantillons.map((item) => (
                  <option key={item.uid || item.id} value={item.uid || item.id}>
                    {item.reference || `Échantillon #${item.uid || item.id}`}
                    {item.designation ? ` — ${item.designation}` : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="rounded-[10px] border border-dashed border-[#dbe1ea] px-3 py-2 text-[12px] text-[#69758a]">
                Aucun échantillon sur cette demande.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? 'Ouverture…' : 'Créer l’essai'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
