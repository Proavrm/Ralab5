/**
 * PreviewAccessZone.jsx
 * Drop-in zone for the existing Tools page.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="text-[13px] font-semibold">{title}</div>
        <div className="text-[11px] text-text-muted mt-0.5">
          Accès rapide aux pages preview et au workbench sans retaper les URLs.
        </div>
      </div>
      <div className="p-5 flex flex-col gap-3">
        {children}
      </div>
    </div>
  )
}

export default function PreviewAccessZone() {
  const navigate = useNavigate()

  const [demandeUid, setDemandeUid] = useState('')
  const [demandeReference, setDemandeReference] = useState('')
  const [interventionUid, setInterventionUid] = useState('')
  const [prelevementUid, setPrelevementUid] = useState('')

  const preparationPreviewUrl = useMemo(() => {
    if (!demandeUid) return ''
    const params = new URLSearchParams()
    if (demandeReference) params.set('ref', demandeReference)
    return `/preparations-card/${demandeUid}${params.toString() ? `?${params.toString()}` : ''}`
  }, [demandeUid, demandeReference])

  const interventionPreviewNewUrl = useMemo(() => {
    if (!demandeUid) return ''
    const params = new URLSearchParams()
    params.set('demande_id', demandeUid)
    if (demandeReference) params.set('ref', demandeReference)
    return `/interventions-card/new?${params.toString()}`
  }, [demandeUid, demandeReference])

  const interventionPreviewUrl = useMemo(() => {
    if (!interventionUid) return ''
    return `/interventions-card/${interventionUid}`
  }, [interventionUid])

  const prelevementPreviewUrl = useMemo(() => {
    if (!prelevementUid) return ''
    return `/prelevements-card/${prelevementUid}`
  }, [prelevementUid])

  const essaisWorkbenchUrl = useMemo(() => {
    if (!demandeUid) return '/essais-workbench'
    return `/essais-workbench?demande_id=${encodeURIComponent(demandeUid)}`
  }, [demandeUid])

  return (
    <Card title="🧪 Préviews / Workbench">
      <div className="grid grid-cols-4 gap-3 items-end">
        <Field label="Demande UID">
          <Input
            value={demandeUid}
            onChange={(e) => setDemandeUid(e.target.value)}
            placeholder="Ex: 42"
          />
        </Field>

        <Field label="Référence demande">
          <Input
            value={demandeReference}
            onChange={(e) => setDemandeReference(e.target.value)}
            placeholder="Ex: 2026-RA-D0042"
          />
        </Field>

        <Field label="Intervention UID">
          <Input
            value={interventionUid}
            onChange={(e) => setInterventionUid(e.target.value)}
            placeholder="Ex: 15"
          />
        </Field>

        <Field label="Prélèvement UID">
          <Input
            value={prelevementUid}
            onChange={(e) => setPrelevementUid(e.target.value)}
            placeholder="Ex: 8"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => navigate(preparationPreviewUrl)}
          disabled={!preparationPreviewUrl}
        >
          Préparation preview
        </Button>

        <Button
          size="sm"
          variant="primary"
          onClick={() => navigate(interventionPreviewNewUrl)}
          disabled={!interventionPreviewNewUrl}
        >
          Nouvelle intervention preview
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(interventionPreviewUrl)}
          disabled={!interventionPreviewUrl}
        >
          Intervention preview
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(prelevementPreviewUrl)}
          disabled={!prelevementPreviewUrl}
        >
          Prélèvement preview
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(essaisWorkbenchUrl)}
        >
          Essais workbench
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate('/instructions-preview')}
        >
          Instructions preview
        </Button>
      </div>
    </Card>
  )
}
