import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { buildG3CopilotExtractionPrompt, copyTextToClipboard } from '@/lib/copilotPrompts'

const AFFAIRE_REF_RE = /^\d{4}-[A-Z]{2,4}-\d{2,5}$/i
const DEMANDE_REF_RE = /^\d{4}-[A-Z]{2,4}-D\d{3,5}$/i

/**
 * Bouton discret : copie le prompt Copilot (pas le résultat JSON).
 * Si aucune affaireRef n’est fournie, demande le n° Affaire RaLab avant copie.
 */
export default function CopyCopilotPromptButton({
  affaireRef = '',
  demandeRef = '',
  missionRef = '',
  focus = '',
  className = '',
  requireAffaireRef = true,
}) {
  const [feedback, setFeedback] = useState('')
  const [asking, setAsking] = useState(false)
  const [draftAffaire, setDraftAffaire] = useState('')
  const [draftDemande, setDraftDemande] = useState('')
  const [formError, setFormError] = useState('')

  async function copyWithContext({ affaire, demande }) {
    const prompt = buildG3CopilotExtractionPrompt({
      affaireRef: affaire,
      demandeRef: demande,
      missionRef,
      focus,
    })
    const ok = await copyTextToClipboard(prompt)
    setFeedback(ok ? `Prompt copié (${affaire || 'sans affaire'})` : 'Copie impossible')
    window.setTimeout(() => setFeedback(''), 2500)
  }

  async function handleCopy() {
    setFormError('')
    const knownAffaire = String(affaireRef || '').trim()
    const knownDemande = String(demandeRef || '').trim()

    if (knownAffaire) {
      await copyWithContext({ affaire: knownAffaire, demande: knownDemande })
      return
    }

    if (requireAffaireRef) {
      setDraftAffaire('')
      setDraftDemande(knownDemande)
      setAsking(true)
      return
    }

    await copyWithContext({ affaire: '', demande: knownDemande })
  }

  async function confirmAsk() {
    const affaire = String(draftAffaire || '').trim().toUpperCase()
    const demande = String(draftDemande || '').trim().toUpperCase()
    if (!AFFAIRE_REF_RE.test(affaire)) {
      setFormError('Référence affaire invalide (ex. 2026-RA-051).')
      return
    }
    if (demande && !DEMANDE_REF_RE.test(demande)) {
      setFormError('Référence demande invalide (ex. 2026-SP-D0055), ou laissez vide.')
      return
    }
    setAsking(false)
    setFormError('')
    await copyWithContext({ affaire, demande })
  }

  return (
    <div className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleCopy}
        title="Copier le prompt Microsoft Copilot (extraction documents → JSON RaLab)"
        className="px-2 py-1 rounded-lg text-[11px] font-medium text-[#8a95a8] hover:text-[#69758a] hover:bg-[#f3f6fb] transition-colors"
      >
        {feedback || 'Copier prompt Copilot'}
      </button>

      {asking ? (
        <div className="z-20 w-[320px] rounded-xl border border-[#dbe1ea] bg-white p-3 shadow-lg space-y-2">
          <div className="text-[12px] font-semibold text-[#003170]">
            N° Affaire RaLab (obligatoire)
          </div>
          <p className="text-[11px] text-[#69758a] leading-4">
            Indiquez l’affaire cible avant de coller le prompt dans Copilot.
            Elle sera recopiée dans <code>affaire_ralab</code>.
          </p>
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Affaire
            </span>
            <Input
              autoFocus
              value={draftAffaire}
              placeholder="2026-RA-051"
              onChange={(e) => setDraftAffaire(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAsk()
                if (e.key === 'Escape') setAsking(false)
              }}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Demande (optionnel)
            </span>
            <Input
              value={draftDemande}
              placeholder="2026-SP-D0055"
              onChange={(e) => setDraftDemande(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAsk()
                if (e.key === 'Escape') setAsking(false)
              }}
            />
          </label>
          {formError ? (
            <p className="text-[11px] font-semibold text-[#a32d2d]">{formError}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" onClick={() => setAsking(false)}>Annuler</Button>
            <Button size="sm" variant="primary" onClick={confirmAsk}>Copier le prompt</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
