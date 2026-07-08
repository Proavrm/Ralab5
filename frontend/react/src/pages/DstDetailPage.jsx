/**
 * DstDetailPage.jsx
 * Fiche detail d'un dossier DST.
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'

const STATUT_CLS = {
  'En cours': 'bg-[#eaf3de] text-[#3b6d11]',
  'Termine': 'bg-[#eeedfe] text-[#534ab7]',
  'Transmis': 'bg-[#e6f1fb] text-[#185fa5]',
  'Annule': 'bg-[#f1efe8] text-[#5f5e5a]',
}

function Badge({ s }) {
  if (!s) return <span className="text-text-muted text-xs">-</span>
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${STATUT_CLS[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span>
}

function FieldRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border last:border-0">
      <span className="text-[11px] text-text-muted shrink-0">{label}</span>
      <span className={`text-[13px] font-medium text-right ${!value ? 'text-text-muted italic font-normal' : ''}`}>{value || '-'} </span>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-[10px] p-5">
      <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted mb-3">{title}</div>
      {children}
    </div>
  )
}

function shortName(v) {
  const text = String(v || '').replace(/\s+/g, ' ').trim()
  if (!text) return '-'
  const parts = text.split(',').map(part => part.trim()).filter(Boolean)
  if (!parts.length) return '-'
  const tail = parts[parts.length - 1]
  const nameParts = parts.length >= 3 && /^[A-Z]?\d[A-Z0-9]*$/i.test(tail)
    ? parts.slice(0, -1)
    : parts
  return nameParts.join(' ')
}

function dstNumeroEtude(row) {
  return String(
    row['N° étude'] ||
    row['N° etude'] ||
    row['N° affaire étude'] ||
    row['N° affaire etude'] ||
    row['N° affaire'] ||
    row.nAffaire ||
    '',
  ).trim()
}

function classifyAffaireDemandeur(raw) {
  const value = String(raw || '').trim()
  if (!value) return { numeroAffaireNge: '', numeroEtude: '' }
  const first = value[0]
  if (/^[A-Za-z]$/.test(first)) return { numeroAffaireNge: value, numeroEtude: '' }
  if (/^[0-9]$/.test(first)) return { numeroAffaireNge: '', numeroEtude: value }
  return { numeroAffaireNge: value, numeroEtude: '' }
}

function parseDstDateValue(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const fr = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`
  return ''
}

function mapDstPriorite(row) {
  const urgence = String(row?.Urgence || '').toLowerCase()
  const priorite = String(row?.Priorité || row?.Priorite || '').toLowerCase()
  if (urgence.includes('bloquant') || priorite.includes('critique')) return 'Critique'
  if (urgence.includes('gênant') || urgence.includes('genant') || priorite.includes('anomalie')) return 'Haute'
  return 'Normale'
}

export default function DstDetailPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [editDstOpen, setEditDstOpen] = useState(false)
  const [editNumeroAffaireDemandeur, setEditNumeroAffaireDemandeur] = useState('')

  const { data: row, isLoading, isError } = useQuery({
    queryKey: ['dst-row', uid],
    queryFn: () => api.get(`/dst/${uid}`),
    enabled: !!uid,
  })

  const data = row?.data || {}

  const { data: affaires = [] } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => api.get('/affaires'),
  })

  useEffect(() => {
    if (!data || !Object.keys(data).length) return
    setEditNumeroAffaireDemandeur(String(data['N° affaire demandeur'] || '').trim())
  }, [row])

  const updateDstMutation = useMutation({
    mutationFn: async ({ rowId, payload }) => api.patch(`/dst/${rowId}`, { data: payload }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['dst-rows'] })
      qc.invalidateQueries({ queryKey: ['dst-status'] })
      qc.setQueryData(['dst-row', uid], updated)
      setEditDstOpen(false)
    },
  })

  const sortedEntries = useMemo(() => {
    const entries = Object.entries(data)
    return entries.sort((a, b) => a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
  }, [data])

  function buildAffaireUrl(d) {
    const fromAffaireDemandeur = classifyAffaireDemandeur(d['N° affaire demandeur'])
    const explicitNumeroEtude = dstNumeroEtude(d)
    const numeroEtude = explicitNumeroEtude || fromAffaireDemandeur.numeroEtude
    const affaireNge = fromAffaireDemandeur.numeroAffaireNge
    const autreReference = !numeroEtude && !affaireNge ? String(d['N° affaire demandeur'] || '').trim() : ''

    const p = new URLSearchParams({
      create: '1',
      chantier: d['Libellé du projet'] || '',
      site: d['Situation Géographique'] || d['Situation géographique projet'] || '',
      numero_etude: numeroEtude,
      affaire_nge: affaireNge,
      autre_reference: autreReference,
      client: d['Société'] || '',
      responsable: shortName(d.Demandeur),
      statut: 'À qualifier',
    })
    return `/affaires?${p}`
  }

  function buildAffairePrefill(d) {
    const fromAffaireDemandeur = classifyAffaireDemandeur(d['N° affaire demandeur'])
    const explicitNumeroEtude = dstNumeroEtude(d)
    const numeroEtude = explicitNumeroEtude || fromAffaireDemandeur.numeroEtude
    const affaireNge = fromAffaireDemandeur.numeroAffaireNge

    return {
      chantier: d['Libellé du projet'] || '',
      site: d['Situation Géographique'] || d['Situation géographique projet'] || '',
      numero_etude: numeroEtude,
      affaire_nge: affaireNge,
      filiale: d['Société'] || '',
      titulaire: d['Société'] || '',
      responsable: shortName(d.Demandeur),
      client: d['Société'] || '',
      statut: 'À qualifier',
    }
  }

  function createAffaire() {
    const match = findMatchingAffaire(data)
    if (match?.uid) {
      const createDemandeOnExisting = window.confirm(
        `Affaire existante detectee (${match.reference || `#${match.uid}`}).\n\nCreer une nouvelle demande sur cette affaire ?`
      )
      if (createDemandeOnExisting) {
        navigate('/demandes?create=1', {
          state: {
            openCreate: true,
            source_type: 'dst',
            source_id: row?.row_id,
            prefill: buildDemandePrefill(match),
          },
        })
      } else {
        const openExisting = window.confirm("Voulez-vous ouvrir l'affaire existante ?\n\nAnnuler = rester sur la page actuelle.")
        if (!openExisting) return
        navigate(`/affaires/${match.uid}`)
      }
      return
    }
    navigate('/affaires', {
      state: {
        openCreate: true,
        source_type: 'dst',
        source_id: row?.row_id,
        prefill: buildAffairePrefill(data),
      },
    })
  }

  function buildDemandePrefill(matchedAffaire = null) {
    const chrono = data['N° chrono'] || ''
    const fromAffaireDemandeur = classifyAffaireDemandeur(data['N° affaire demandeur'])
    const explicitNumeroEtude = dstNumeroEtude(data)
    const numeroAffaireNge = fromAffaireDemandeur.numeroAffaireNge
    const numeroEtude = explicitNumeroEtude || fromAffaireDemandeur.numeroEtude
    const dstField = (...keys) => keys.map((key) => String(data?.[key] || '').trim()).find(Boolean) || ''
    const objet = String(data['Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)'] || '')
      .replace(/_x000D_/gi, '').trim()
    const typePrestation = dstField('Type de prestation attendue', 'Autre type de prestation')

    return {
      source: {
        source_type: 'dst',
        source_id: row?.row_id,
        numero_dst: chrono,
        libelle_projet: data['Libellé du projet'] || '',
        demandeur: shortName(data.Demandeur),
      },
      demande: {
        affaire_rst_id: matchedAffaire?.uid || undefined,
        numero_dst: chrono,
        numero_affaire_nge: numeroAffaireNge,
        numero_etude: numeroEtude,
        type_mission: typePrestation,
        nature: data['Cadre de la demande'] || 'Demande DST',
        domaine_etude: dstField("Domaine d'étude", "Autre domaine d'étude"),
        type_prestation_attendue: typePrestation,
        documents_fournis: dstField('Liste des documents fournis'),
        lien_pieces_jointes: dstField("Lien d'accès pièces jointes volumineuses"),
        service_interne: dstField('Service'),
        societe_interne: dstField('Société'),
        urgence_source: dstField('Urgence'),
        date_echeance: parseDstDateValue(dstField('Remise souhaitée', 'Echéance')),
        priorite: mapDstPriorite(data),
        demandeur: shortName(data.Demandeur),
        description: [chrono ? `DST: ${chrono}` : '', data['Libellé du projet'] || '', objet].filter(Boolean).join('\n'),
        observations: `Pre-remplie depuis DST ${chrono}`.trim(),
      },
    }
  }

  function normCode(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, '')
  }

  function etudeCandidates(v) {
    const base = normCode(v)
    if (!base) return []
    const out = [base]
    const y4 = base.match(/^20(\d{2})(.+)$/)
    if (y4) out.push(`${y4[1]}${y4[2]}`)
    const y2 = base.match(/^(\d{2})(.+)$/)
    if (y2 && !base.startsWith('20')) out.push(`20${y2[1]}${y2[2]}`)
    return Array.from(new Set(out))
  }

  function findMatchingAffaire(d) {
    const fromAffaireDemandeur = classifyAffaireDemandeur(d['N° affaire demandeur'])
    const explicitNumeroEtude = dstNumeroEtude(d)
    const numeroEtude = explicitNumeroEtude || fromAffaireDemandeur.numeroEtude
    const numeroAffaireNge = fromAffaireDemandeur.numeroAffaireNge

    const etudeKeys = etudeCandidates(numeroEtude)
    const ngeKey = normCode(numeroAffaireNge)

    return affaires.find((a) => {
      const affaireEtudeKeys = etudeCandidates(a.numero_etude)
      const etudeMatch = etudeKeys.length > 0 && affaireEtudeKeys.some((key) => etudeKeys.includes(key))
      const ngeMatch = !!ngeKey && normCode(a.affaire_nge) === ngeKey
      return etudeMatch || ngeMatch
    }) || null
  }

  function createDemande() {
    navigate('/demandes?create=1', {
      state: {
        openCreate: true,
        source_type: 'dst',
        source_id: row?.row_id,
        prefill: buildDemandePrefill(),
      },
    })
  }

  function saveEditDst() {
    if (!row?.row_id) return
    const payload = {
      'N° affaire demandeur': editNumeroAffaireDemandeur.trim(),
    }
    updateDstMutation.mutate({ rowId: row.row_id, payload })
  }

  if (isLoading) {
    return <div className="text-xs text-text-muted text-center py-12">Chargement...</div>
  }

  if (isError || !row) {
    return (
      <div className="text-xs text-text-muted text-center py-12">
        Dossier DST introuvable.{' '}
        <button onClick={() => navigate('/dst')} className="text-accent underline">Retour DST</button>
      </div>
    )
  }

  const ouverture = formatDate(data.Ouverture)
  const echeance = formatDate(data['Remise souhaitée'] || data['Echéance estimée'] || data.Echéance)

  return (
    <div className="flex flex-col h-full -m-6 overflow-y-auto">
      <div className="flex items-center gap-2 px-7 bg-surface border-b border-border h-[58px] shrink-0 sticky top-0 z-10 flex-wrap">
        <button
          onClick={() => navigate('/dst')}
          className="flex items-center gap-1.5 text-text-muted text-[13px] hover:bg-bg hover:text-text px-2.5 py-1.5 rounded transition-colors shrink-0"
        >
          ← DST
        </button>
        <span className="text-[15px] font-semibold flex-1">Dossier DST {data['N° chrono'] || row.row_id}</span>
        <Button size="sm" variant="primary" onClick={() => setEditDstOpen(true)}>✏️ Corriger DST</Button>
        <Button size="sm" onClick={createAffaire}>📋 Créer affaire</Button>
        <Button size="sm" onClick={createDemande}>📂 Créer demande</Button>
      </div>

      <div className="p-7 max-w-[1050px] mx-auto w-full flex flex-col gap-5">
        <Card title="Synthèse DST">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FieldRow label="N° chrono" value={data['N° chrono']} />
            <FieldRow label="Projet" value={data['Libellé du projet']} />
            <FieldRow label="Statut" value={<Badge s={data.Statut} />} />
            <FieldRow label="Demandeur" value={data.Demandeur} />
            <FieldRow label="Société" value={data.Société} />
            <FieldRow label="Service DST" value={data['Service DST']} />
            <FieldRow label="Ouverture" value={ouverture} />
            <FieldRow label="Echéance" value={echeance} />
            <FieldRow label="N° affaire demandeur" value={data['N° affaire demandeur']} />
          </div>
        </Card>

        {data['Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)'] && (
          <Card title="Objet de la demande">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-text">
              {String(data['Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)']).replace(/_x000D_/gi, '').trim()}
            </p>
          </Card>
        )}

        <Card title="Données source complètes">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            {sortedEntries.map(([key, value]) => (
              <FieldRow key={key} label={key} value={String(value || '')} />
            ))}
          </div>
        </Card>
      </div>

      <Modal open={editDstOpen} onClose={() => setEditDstOpen(false)} title="Corriger le dossier DST" size="sm">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-text-muted">
            Corriger les identifiants source quand la ligne DST contient une erreur.
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">N° affaire demandeur</label>
            <input
              value={editNumeroAffaireDemandeur}
              onChange={(e) => setEditNumeroAffaireDemandeur(e.target.value)}
              className="px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent"
            />
          </div>
          {updateDstMutation.error ? (
            <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">
              {updateDstMutation.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setEditDstOpen(false)} variant="secondary">Annuler</Button>
            <Button onClick={saveEditDst} variant="primary" disabled={updateDstMutation.isPending}>
              {updateDstMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
