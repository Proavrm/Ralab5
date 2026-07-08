import Button from '@/components/ui/Button'
import {
  MISSION_TERRAIN_FICHE_BUTTON_LABEL,
  openSiteAccessRapport,
} from '@/lib/siteAccessRapport'

export default function SiteAccessRapportButton({
  demandeUid,
  campagneUid = '',
  interventionUid = '',
  missionDate = '',
  technicien = '',
  interventions = null,
  skipReadinessCheck = false,
  returnTo = '',
  size = 'sm',
  variant = 'secondary',
  disabled = false,
  className = '',
  label = MISSION_TERRAIN_FICHE_BUTTON_LABEL,
}) {
  const canOpen = Boolean(String(demandeUid || '').trim()) && !disabled
  const isJournee = Boolean(String(missionDate || '').trim())
  const title = isJournee
    ? "Feuille mission du jour : interventions prévues, accès, situation et implantation"
    : "Fiche imprimable pour l'équipe terrain : mission, accès, situation, itinéraire et implantation"

  return (
    <Button
      size={size}
      variant={variant}
      disabled={!canOpen}
      className={className}
      title={title}
      onClick={() => openSiteAccessRapport({
        demandeUid,
        campagneUid,
        interventionUid,
        missionDate,
        technicien,
        returnTo,
        interventions: Array.isArray(interventions) ? interventions : undefined,
        skipReadinessCheck,
      })}
    >
      {label}
    </Button>
  )
}
