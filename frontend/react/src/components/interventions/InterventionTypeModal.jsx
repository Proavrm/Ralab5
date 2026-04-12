import Modal from '@/components/ui/Modal'

export const INTERVENTION_TYPE_GROUPS = [
  {
    title: 'Visites et constats',
    items: [
      { value: 'Visite chantier', description: 'Présence terrain, visite opérationnelle ou suivi ponctuel.' },
      { value: 'Visite de constat', description: 'Constat ciblé, observation contradictoire ou visite de contrôle.' },
      { value: 'Recontrôle', description: 'Retour terrain après premier contrôle ou après correction.' },
      { value: 'Contre-visite', description: 'Nouvelle visite après réserve, anomalie ou demande de vérification.' },
      { value: 'Visite G3', description: 'Suivi géotechnique d’exécution sur site.' },
      { value: 'Réunion technique sur site', description: 'Réunion opérationnelle avec contexte terrain à tracer.' },
    ],
  },
  {
    title: 'Opérations terrain',
    items: [
      { value: 'Essai de plaque', description: 'Contrôle de portance ou essai sur un ou plusieurs points.' },
      { value: 'Prélèvement', description: 'Prise d’échantillons pour laboratoire ou conservation.' },
      { value: 'Sondage', description: 'Reconnaissance ponctuelle, coupe, sondage ou point géotechnique.' },
      { value: 'Carottage', description: 'Prélèvement par carotte ou carottage de structure.' },
      { value: 'Campagne de description géotechnique', description: 'Description et journalisation de plusieurs points de terrain.' },
    ],
  },
  {
    title: 'Contrôles et matériel',
    items: [
      { value: 'Contrôle béton frais', description: 'Contrôle terrain ou prélèvement sur béton frais.' },
      { value: 'Pose de matériel', description: 'Installation d’équipement, repère ou instrumentation.' },
      { value: 'Relevé de matériel', description: 'Dépose, relève ou récupération d’un dispositif.' },
      { value: 'Autre', description: 'Intervention non standard à qualifier ensuite dans la fiche.' },
    ],
  },
]

export const INTERVENTION_TYPE_OPTIONS = [
  ...INTERVENTION_TYPE_GROUPS.flatMap((group) => group.items.map((item) => item.value)),
]

export function buildInterventionTypeOptions(currentValue = '') {
  const normalized = String(currentValue || '').trim()
  if (!normalized || INTERVENTION_TYPE_OPTIONS.includes(normalized)) {
    return INTERVENTION_TYPE_OPTIONS
  }
  return [normalized, ...INTERVENTION_TYPE_OPTIONS]
}

export function applyInterventionTypeToPath(path, typeIntervention) {
  const [pathWithoutHash, hash = ''] = String(path || '').split('#')
  const [pathname, query = ''] = pathWithoutHash.split('?')
  const params = new URLSearchParams(query)

  if (typeIntervention) {
    params.set('type_intervention', typeIntervention)
  } else {
    params.delete('type_intervention')
  }

  const nextQuery = params.toString()
  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`
}

export default function InterventionTypeModal({
  open,
  onClose,
  onSelect,
  title = 'Choisir le type d’intervention',
  subtitle = '',
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <div className="flex flex-col gap-4">
        <div className="rounded-[10px] border border-border bg-bg px-4 py-3 text-[13px] leading-6 text-text-muted">
          <div className="font-medium text-text">Choisir ici l’action concrète à planifier et exécuter.</div>
          <div>Les points, prélèvements, sondages, contrôles et observations seront saisis ensuite dans la fiche d’intervention.</div>
          {subtitle ? <div className="mt-2 text-[12px]">{subtitle}</div> : null}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {INTERVENTION_TYPE_GROUPS.map((group) => (
            <div key={group.title} className="rounded-[10px] border border-border bg-surface p-4 flex flex-col gap-3">
              <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted">{group.title}</div>
              <div className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onSelect?.(item.value)}
                    className="w-full rounded-lg border border-border bg-bg px-3 py-3 text-left transition-colors hover:border-accent hover:bg-surface"
                  >
                    <div className="text-[13px] font-semibold text-text">{item.value}</div>
                    <div className="mt-1 text-[12px] leading-5 text-text-muted">{item.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}