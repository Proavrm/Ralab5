import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import DemandeReferencePicker from '@/components/demande/DemandeReferencePicker'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import { resolveG3NotesTechniquesPath } from '@/lib/modeleNTContent'
import { demandesApi } from '@/services/api'

export default function G3Page() {
  const navigate = useNavigate()
  const [demandeQuery, setDemandeQuery] = useState('')
  const [demandeId, setDemandeId] = useState(null)

  async function openNotesTechniques() {
    const value = String(demandeQuery || '').trim()
    if (!value) return

    let id = demandeId
    if (!id) {
      try {
        const demandes = await demandesApi.list({ search: value })
        const list = Array.isArray(demandes) ? demandes : (demandes?.items || [])
        const match = list.find((d) => String(d.reference || '').toLowerCase() === value.toLowerCase())
          || list.find((d) => String(d.reference || '').toLowerCase().includes(value.toLowerCase()))
        id = match?.id ?? match?.uid ?? null
      } catch {
        id = null
      }
    }

    if (id) {
      navigate(buildPathWithReturnTo(`/avis-technique/nouveau?demande_id=${id}`, '/g3'))
      return
    }

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
                Nouvelle rédaction NT / Avis
              </Button>
            </div>
            <DemandeReferencePicker
              value={demandeQuery}
              onChange={(value) => { setDemandeQuery(value); setDemandeId(null) }}
              onSelect={(row) => {
                setDemandeQuery(row.reference)
                setDemandeId(row.uid ?? row.id ?? null)
              }}
              listMode="inline"
              defaultOpen
              placeholder="Filtrer par référence, affaire, chantier…"
            />
          </SectionCard>

          <SectionCard title="Calculs de dimensionnement">
            <p className="text-[13px] leading-6 text-text-muted mb-4">
              Module indépendant : Alizé (chaussées), Gel-Dégel et Talren. Traçabilité, variantes et fiche.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate('/calculs')}>
                Ouvrir Calculs
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/g3/fiche-calcul')}>
                Ancienne fiche locale
              </Button>
            </div>
          </SectionCard>
        </div>
      </FicheMain>
    </FichePageShell>
  )
}
