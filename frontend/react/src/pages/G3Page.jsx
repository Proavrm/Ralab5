import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import DemandeReferencePicker from '@/components/demande/DemandeReferencePicker'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import { resolveG3NotesTechniquesPath } from '@/lib/modeleNTContent'

export default function G3Page() {
  const navigate = useNavigate()
  const [demandeQuery, setDemandeQuery] = useState('')

  async function openNotesTechniques() {
    const value = String(demandeQuery || '').trim()
    if (!value) return
    const path = await resolveG3NotesTechniquesPath({ demandeRef: value, returnTo: '/g3' })
    navigate(path)
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Accueil"
        onBack={() => navigate('/dashboard')}
        eyebrow="G3"
        title="Exploitation G3"
        subtitle="Notes techniques, avis et documents d'étude"
      />

      <FicheMain>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard title="Missions G3 EXE">
            <p className="text-[13px] leading-6 text-text-muted mb-4">
              Pilotage complet d'une mission géotechnique G3 : programme, interventions, avis et livrables.
            </p>
            <Button size="sm" onClick={() => navigate('/g3/missions')}>
              📂 Ouvrir les missions G3
            </Button>
          </SectionCard>

          <SectionCard title="Notes techniques">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Button size="sm" onClick={() => navigate('/g3/notes-techniques')}>
                📝 Portefeuille NT
              </Button>
              <Button size="sm" onClick={openNotesTechniques} disabled={!demandeQuery.trim()}>
                Ouvrir notes techniques
              </Button>
            </div>
            <DemandeReferencePicker
              value={demandeQuery}
              onChange={setDemandeQuery}
              listMode="inline"
              defaultOpen
              placeholder="Filtrer par référence, affaire, chantier…"
            />
          </SectionCard>

          <SectionCard title="Fiche de calcul">
            <p className="text-[13px] leading-6 text-text-muted mb-4">
              Deux outils distincts : <strong>Allyze</strong> (chaussées) et <strong>Talren</strong> (taludes / murs).
              Paramètres structurés, sans dupliquer le dossier.
            </p>
            <Button size="sm" onClick={() => navigate('/g3/fiche-calcul')}>
              📐 Ouvrir fiche de calcul
            </Button>
          </SectionCard>
        </div>
      </FicheMain>
    </FichePageShell>
  )
}
