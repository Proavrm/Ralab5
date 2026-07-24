import { useState } from 'react'
import { buildG3CopilotExtractionPrompt, copyTextToClipboard } from '@/lib/copilotPrompts'

/**
 * Bouton discret : copie le prompt Copilot (pas le résultat JSON).
 */
export default function CopyCopilotPromptButton({
  affaireRef = '',
  demandeRef = '',
  missionRef = '',
  focus = '',
  className = '',
}) {
  const [feedback, setFeedback] = useState('')

  async function handleCopy() {
    const prompt = buildG3CopilotExtractionPrompt({
      affaireRef,
      demandeRef,
      missionRef,
      focus,
    })
    const ok = await copyTextToClipboard(prompt)
    setFeedback(ok ? 'Prompt copié' : 'Copie impossible')
    window.setTimeout(() => setFeedback(''), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copier le prompt Microsoft Copilot (extraction documents → JSON RaLab)"
      className={`px-2 py-1 rounded-lg text-[11px] font-medium text-[#8a95a8] hover:text-[#69758a] hover:bg-[#f3f6fb] transition-colors ${className}`}
    >
      {feedback || 'Copier prompt Copilot'}
    </button>
  )
}
