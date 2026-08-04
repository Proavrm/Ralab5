import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import CopyCopilotPromptButton from '@/components/copilot/CopyCopilotPromptButton'
import {
  applyG3CopilotImportFull,
  buildAffaireActorDiff,
  formatAffaireActorChangesMessage,
  parseG3CopilotImport,
  previewAffaireDemandeResolve,
  resolveAffaireForCopilotImport,
  summarizeG3Import,
} from '@/lib/g3CopilotImport'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'

/**
 * Zone discrète : coller le JSON Copilot et appliquer à une mission G3.
 * Mode allowCreateMissing : crée affaire + demande si absentes.
 * Demande confirmation avant d’écraser / renseigner MOA-MOE sur une affaire existante.
 */
export default function CopilotImportPanel({
  demandeId = null,
  demandes = null,
  affaireId = null,
  affaireRef = '',
  allowCreateMissing = false,
  returnTo = '',
  showPromptCopy = false,
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [selectedDemandeId, setSelectedDemandeId] = useState(() => (
    demandeId != null ? String(demandeId) : ''
  ))
  const [parsed, setParsed] = useState(null)
  const [summary, setSummary] = useState(null)
  const [resolvePreview, setResolvePreview] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resultMsg, setResultMsg] = useState('')

  const needsDemandePick = Array.isArray(demandes) && demandeId == null && demandes.length > 0
  const effectiveDemandeId = needsDemandePick
    ? (selectedDemandeId || (demandes.length === 1 ? String(demandes[0].id ?? demandes[0].uid ?? '') : ''))
    : String(demandeId ?? '')

  const canApplyExisting = Boolean(effectiveDemandeId)
  const canCreateMissing = allowCreateMissing && !canApplyExisting

  const summaryLines = useMemo(() => {
    if (!summary) return []
    return [
      `Titre: ${summary.title}`,
      `Client: ${summary.client} · Chantier: ${summary.chantier}`,
      `MOA: ${summary.moa || '—'} · MOE: ${summary.moe || '—'}`,
      summary.lookupAffaireRef
        ? `Affaire RaLab (affaire_ralab): ${summary.lookupAffaireRef}`
        : 'Affaire RaLab (affaire_ralab): — (aucune)',
      summary.lookupDemandeRef
        ? `Demande RaLab (demande_ralab): ${summary.lookupDemandeRef}`
        : null,
      `${summary.zones} zone(s) · ${summary.documents} doc(s) · ${summary.objectives} objectif(s)`,
      `${summary.interventions} intervention(s) · ${summary.holdPoints} point(s) d’arrêt`,
      summary.mediaTotal
        ? `Médias/plans: ${summary.mediaFound} trouvé(s) · ${summary.mediaMissing} manquant(s)`
        : null,
      summary.situationMissing ? 'Plan de situation: manquant (à uploader / capturer)' : (summary.hasSituation ? 'Plan de situation: inventorié' : null),
      summary.implantationMissing ? "Plan d’implantation: manquant" : (summary.hasImplantation ? "Plan d’implantation: inventorié" : null),
      summary.confidence != null ? `Confiance: ${Math.round(summary.confidence * 100)}%` : null,
    ].filter(Boolean)
  }, [summary])

  /**
   * Synchro affaire : champs vides → ajout auto ; valeurs existantes différentes → confirm.
   * Annuler un remplacement = abort de tout l’import.
   */
  async function askAffaireActorPatch({ payload, targetAffaireId = null, targetDemandeId = null }) {
    const affaire = await resolveAffaireForCopilotImport({
      payload,
      affaireId: targetAffaireId,
      demandeId: targetDemandeId,
    })
    if (!affaire) return { patch: null, aborted: false }
    const { fills, overwrites } = buildAffaireActorDiff(affaire, payload)
    if (!fills.length && !overwrites.length) return { patch: null, aborted: false }

    if (overwrites.length) {
      const ok = window.confirm(
        formatAffaireActorChangesMessage(affaire.reference || '', overwrites),
      )
      if (!ok) return { patch: null, aborted: true }
    }

    // fills toujours appliqués ; overwrites seulement si confirmés (ci-dessus)
    const patch = {}
    for (const entry of fills) patch[entry.key] = entry.to
    for (const entry of overwrites) patch[entry.key] = entry.to
    return { patch, aborted: false }
  }

  async function handleParse() {
    setError('')
    setResultMsg('')
    setResolvePreview(null)
    try {
      const data = parseG3CopilotImport(raw)
      const nextSummary = summarizeG3Import(data)
      setParsed(data)
      setSummary(nextSummary)
      if (allowCreateMissing) {
        try {
          const preview = await previewAffaireDemandeResolve({
            payload: data,
            affaireId,
          })
          setResolvePreview(preview)
        } catch {
          setResolvePreview(null)
        }
      }
    } catch (err) {
      setParsed(null)
      setSummary(null)
      setResolvePreview(null)
      setError(err?.message || 'Analyse impossible.')
    }
  }

  async function handleApply({ createMissing = false } = {}) {
    setError('')
    setResultMsg('')
    if (!parsed) {
      setError('Analysez d’abord le JSON.')
      return
    }
    if (!createMissing && !effectiveDemandeId) {
      setError('Sélectionnez une demande cible.')
      return
    }

    if (createMissing) {
      let preview = resolvePreview
      if (!preview) {
        try {
          preview = await previewAffaireDemandeResolve({
            payload: parsed,
            affaireId,
          })
          setResolvePreview(preview)
        } catch (err) {
          setError(err?.message || 'Prévisualisation impossible.')
          return
        }
      }
      const warnBlock = (preview.misplaced || []).length
        ? `\n\nAttention:\n- ${(preview.misplaced || []).join('\n- ')}`
        : ''
      const ok = window.confirm(
        `${preview.message}${warnBlock}\n\nConfirmer l’import ?`,
      )
      if (!ok) return
    }

    let affaireActorPatch = null
    try {
      const decision = await askAffaireActorPatch({
        payload: parsed,
        targetAffaireId: createMissing ? affaireId : null,
        targetDemandeId: createMissing ? null : effectiveDemandeId,
      })
      if (decision.aborted) return
      affaireActorPatch = decision.patch
    } catch (err) {
      setError(err?.message || 'Impossible de comparer les champs avec l’affaire.')
      return
    }

    setBusy(true)
    try {
      const {
        mission,
        created,
        counts,
        createdAffaire,
        createdDemande,
        updatedAffaireActors,
        affaire,
        demande,
      } = await applyG3CopilotImportFull({
        payload: parsed,
        demandeId: createMissing ? null : effectiveDemandeId,
        affaireId: createMissing ? affaireId : null,
        createMissing,
        affaireActorPatch,
      })
      const parts = [
        createdAffaire ? `Affaire ${affaire?.reference || ''} créée` : null,
        !createdAffaire && updatedAffaireActors
          ? `Affaire ${affaire?.reference || ''} : champs mis à jour`
          : null,
        !createdAffaire && !updatedAffaireActors && affaire?.reference
          ? `Affaire ${affaire.reference}`
          : null,
        createdDemande ? `Demande ${demande?.reference || ''} créée` : null,
        created ? 'Mission G3 créée' : 'Mission G3 mise à jour',
        counts.zones ? `${counts.zones} zone(s)` : null,
        counts.documents ? `${counts.documents} doc(s)` : null,
        counts.objectives ? `${counts.objectives} objectif(s)` : null,
        counts.interventions ? `${counts.interventions} intervention(s)` : null,
        counts.holdPoints ? `${counts.holdPoints} PA` : null,
      ].filter(Boolean)
      setResultMsg(parts.join(' · '))
      if (mission?.id) {
        navigate(buildPathWithReturnTo(`/g3/missions/${mission.id}`, returnTo || undefined))
      }
    } catch (err) {
      setError(err?.message || 'Application impossible.')
    } finally {
      setBusy(false)
    }
  }

  const createLabel = affaireId
    ? 'Créer demande + mission G3'
    : 'Créer affaire + demande + mission G3'

  return (
    <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#fbfcfe]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8a95a8]">
          Import Copilot (JSON)
        </span>
        <span className="text-[11px] text-[#69758a]">{open ? 'Masquer' : 'Ouvrir'}</span>
      </button>

      {open ? (
        <div className="border-t border-[#eef2f7] px-3.5 py-3 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-[12px] text-[#69758a] leading-5 max-w-[720px]">
              Collez le JSON renvoyé par Microsoft Copilot (pas le prompt).
              {allowCreateMissing
                ? ' Rattachement uniquement via affaire_ralab / demande_ralab explicites — confirmation avant création.'
                : ' RaLab met à jour ou crée la mission G3 de la demande.'}
            </p>
            {showPromptCopy ? (
              <CopyCopilotPromptButton affaireRef={affaireRef} />
            ) : null}
          </div>

          {needsDemandePick ? (
            <div className="flex flex-col gap-1 max-w-md">
              <label className="text-[10px] font-medium text-text-muted">Demande cible (existante)</label>
              <Select
                value={effectiveDemandeId}
                onChange={(e) => setSelectedDemandeId(e.target.value)}
              >
                <option value="">Sélectionner…</option>
                {(demandes || []).map((d) => {
                  const id = d.id ?? d.uid
                  return (
                    <option key={id} value={String(id)}>
                      {d.reference || `Demande #${id}`}
                    </option>
                  )
                })}
              </Select>
            </div>
          ) : null}

          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={7}
            placeholder='{"schema_version":"ralab5.g3.import.v1", ...}'
            className="w-full px-3 py-2 border border-border rounded-lg text-[12px] font-mono bg-white outline-none focus:border-nge resize-y"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleParse} disabled={!raw.trim() || busy}>
              Analyser
            </Button>
            {canApplyExisting ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleApply({ createMissing: false })}
                disabled={!parsed || busy}
              >
                {busy ? 'Application…' : 'Appliquer à la mission G3'}
              </Button>
            ) : null}
            {canCreateMissing || (allowCreateMissing && affaireId != null) ? (
              <Button
                size="sm"
                variant={canApplyExisting ? 'secondary' : 'primary'}
                onClick={() => handleApply({ createMissing: true })}
                disabled={!parsed || busy}
              >
                {busy ? 'Création…' : createLabel}
              </Button>
            ) : null}
          </div>

          {summaryLines.length ? (
            <div className="rounded-lg border border-[#dbe1ea] bg-white px-3 py-2 text-[12px] text-[#172033] space-y-0.5">
              {summaryLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
              {resolvePreview?.message ? (
                <div className="pt-1 font-semibold text-[#003170]">
                  Action prévue: {resolvePreview.message}
                </div>
              ) : null}
              {resolvePreview?.actorFills?.length ? (
                <div className="pt-1 text-[#0f6e56]">
                  À renseigner (sans confirmation):
                  {resolvePreview.actorFills.map((c) => (
                    <div key={c.key}>{`- ${c.label} : ${c.to}`}</div>
                  ))}
                </div>
              ) : null}
              {resolvePreview?.actorOverwrites?.length ? (
                <div className="pt-1 text-[#854f0b]">
                  Remplacement à confirmer:
                  {resolvePreview.actorOverwrites.map((c) => (
                    <div key={c.key}>{`- ${c.label} : ${c.from} → ${c.to}`}</div>
                  ))}
                </div>
              ) : null}
              {summary?.misplacedRefs?.length ? (
                <div className="pt-1 text-[#a32d2d]">
                  {summary.misplacedRefs.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
              ) : null}
              {summary?.missingCritical?.length ? (
                <div className="pt-1 text-[#854f0b]">
                  Manques: {summary.missingCritical.slice(0, 3).join(' · ')}
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-[12px] font-bold text-[#a32d2d]">{error}</p> : null}
          {resultMsg ? <p className="text-[12px] font-bold text-[#0f6e56]">{resultMsg}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
