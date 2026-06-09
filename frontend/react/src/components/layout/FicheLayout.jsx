/**
 * Composants visuels partagés — style fiche Demande / Campagnes
 */
import { formatDate } from '@/lib/utils'

export const PAGE_BG = 'radial-gradient(circle at top right, rgba(255,204,0,0.18), transparent 32%), linear-gradient(180deg, #f8fafc 0%, #f3f6fb 42%, #eef3fa 100%)'

export const DEMANDE_STAT_CLS = {
  'À qualifier': 'bg-[#f1efe8] text-[#5f5e5a]',
  Demande: 'bg-[#e6f1fb] text-[#185fa5]',
  'En Cours': 'bg-[#eaf3de] text-[#3b6d11]',
  Répondu: 'bg-[#eeedfe] text-[#534ab7]',
  Fini: 'bg-[#e0f5ef] text-[#0f6e56]',
  'Envoyé - Perdu': 'bg-[#fcebeb] text-[#a32d2d]',
  'À cadrer': 'bg-[#f1efe8] text-[#5f5e5a]',
  'En cours': 'bg-[#eaf3de] text-[#3b6d11]',
  Terminée: 'bg-[#e0f5ef] text-[#0f6e56]',
  Archivée: 'bg-[#eeedfe] text-[#534ab7]',
  Planifiée: 'bg-[#e6f1fb] text-[#185fa5]',
  Réalisée: 'bg-[#e0f5ef] text-[#0f6e56]',
  Annulée: 'bg-[#fcebeb] text-[#a32d2d]',
  Importée: 'bg-[#eeedfe] text-[#534ab7]',
  Ouverte: 'bg-[#eaf3de] text-[#3b6d11]',
  Clôturée: 'bg-[#e0f5ef] text-[#0f6e56]',
}

export const PRIO_CLS = {
  Basse: 'bg-[#f1efe8] text-[#5f5e5a]',
  Normale: 'bg-[#e6f1fb] text-[#185fa5]',
  Haute: 'bg-[#faeeda] text-[#854f0b]',
  Critique: 'bg-[#fcebeb] text-[#a32d2d]',
  Urgente: 'bg-[#fcebeb] text-[#a32d2d]',
}

export const LABO_NOM = { SP: 'Saint-Priest', PDC: 'Pont-du-Château', CHB: 'Chambéry', CLM: 'Clermont' }

export function computeUrgDate(demande) {
  if (!demande?.date_echeance || ['Fini', 'Envoyé - Perdu', 'Archivée'].includes(demande?.statut)) return null
  return (new Date(demande.date_echeance) - new Date()) / 86400000
}

export function FicheBadge({ s, map }) {
  const cls = (map || DEMANDE_STAT_CLS)[s] || 'bg-[#f1efe8] text-[#5f5e5a]'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-[11px] font-black leading-none ${cls}`}>
      {s || '—'}
    </span>
  )
}

export function FieldCard({ label, value, highlight, className = '' }) {
  return (
    <div className={`min-w-0 rounded-[14px] px-3 py-2.5 ${highlight ? 'border border-[#efd36b] bg-gradient-to-b from-[#fffdf2] to-[#fbfcfe]' : 'border border-[#e4e9f1] bg-[#fbfcfe]'} ${className}`}>
      <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a]">{label}</div>
      <div className="mt-1.5 min-h-[22px] text-[13px] font-black text-[#172033] break-words">{value || '—'}</div>
    </div>
  )
}

export function MetricCard({ label, value, detail }) {
  return (
    <div className="relative overflow-hidden rounded-[10px] border border-[#dbe1ea] bg-white px-2.5 py-2">
      <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: 'linear-gradient(90deg, #ffcc00, transparent 78%)' }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[8.5px] font-black uppercase tracking-[.11em] text-[#69758a] truncate">{label}</span>
        <span className="text-[8.5px] font-medium text-[#8a95a8] truncate text-right">{detail}</span>
      </div>
      <div className="mt-1 text-[16px] font-black leading-none text-[#003170]">{value}</div>
    </div>
  )
}

export function SectionCard({ title, subtitle, chip, actions, children, technical }) {
  return (
    <section className={`overflow-hidden rounded-[18px] border bg-white ${technical ? 'opacity-[.82] border-dashed border-[#dbe1ea] shadow-none' : 'border-[#dbe1ea] shadow-[0_6px_22px_rgba(0,49,112,0.06)]'}`}>
      <div
        className={`flex justify-between items-center gap-3 border-b border-[#e5e9f0] px-5 py-2.5 ${technical ? 'min-h-[40px] bg-[#f7f8fb]' : 'min-h-[44px]'}`}
        style={!technical ? { background: 'linear-gradient(90deg, #f8fafc 0%, #f8fafc 78%, #fff6cf 100%)' } : undefined}
      >
        <div>
          <div className={`font-black uppercase tracking-[.12em] ${technical ? 'text-[11px] text-[#536079]' : 'text-[13px] text-[#003170]'}`}>{title}</div>
          {subtitle ? <div className="mt-0.5 text-[11px] text-[#69758a]">{subtitle}</div> : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {chip}
          {actions}
        </div>
      </div>
      <div className={technical ? 'p-3.5' : 'p-5'}>{children}</div>
    </section>
  )
}

export function FicheTopbar({ backLabel, onBack, eyebrow, title, children }) {
  return (
    <div
      className="sticky top-0 z-10 border-b border-[#dbe1ea]"
      style={{ background: 'rgba(255,255,255,0.96)', boxShadow: '0 6px 24px rgba(0,49,112,0.08)', backdropFilter: 'blur(12px)' }}
    >
      <div style={{ height: '1px', background: 'linear-gradient(90deg, #003170 0%, #003170 70%, #ffcc00 70%, #ffcc00 100%)' }} />
      <div className="w-full max-w-full mx-auto px-6 flex flex-wrap items-center gap-1.5 py-1.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="px-2.5 py-1 rounded-xl text-[#69758a] text-[11px] font-bold hover:bg-[#f3f6fb] hover:text-[#172033] transition-colors shrink-0 leading-none"
          >
            {backLabel}
          </button>
        ) : null}
        <div className="flex-1 min-w-[220px] leading-tight">
          <div className="text-[#8a95a8] text-[9px] font-bold tracking-[.12em] uppercase truncate">{eyebrow}</div>
          <div className="text-[13px] font-black truncate">{title}</div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function EmptyStateBox({ icon, title, description, action }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-8 flex flex-col items-center gap-3 text-center">
      <div className="text-[32px]">{icon}</div>
      <div className="text-[15px] font-black text-[#172033]">{title}</div>
      {description ? <div className="text-[13px] text-[#69758a] max-w-[480px] leading-6">{description}</div> : null}
      {action}
    </div>
  )
}

export function DemandeHero({ demande, badgeLabel = 'RaLab 5 · Demande RST' }) {
  if (!demande) return null
  const urgDate = computeUrgDate(demande)
  return (
    <section className="overflow-hidden rounded-[26px] border border-[#dbe1ea] bg-white" style={{ boxShadow: '0 10px 34px rgba(0,49,112,0.08)' }}>
      <div
        className="relative flex flex-wrap justify-between gap-6 text-white px-[30px] pt-[30px] pb-7"
        style={{ background: 'linear-gradient(135deg, #003170 0%, #00224f 74%, #001a3d 100%)' }}
      >
        <div className="absolute right-0 bottom-0 w-[270px] h-2.5 bg-[#ffcc00] rounded-tl-full" />
        <div>
          <div className="inline-flex items-center gap-2 mb-3.5 rounded-full border border-[rgba(255,204,0,0.55)] bg-[rgba(255,204,0,0.12)] px-2.5 py-1.5 text-[11px] font-black tracking-[.12em] uppercase">
            <span className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }} />
            {badgeLabel}
          </div>
          <h1 className="text-[32px] font-black leading-none tracking-tight m-0">{demande.reference}</h1>
          <div className="mt-3 text-[20px] font-black">{demande.nature || demande.type_mission || '—'}</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 text-[13px] text-white/80">
            {demande.affaire_ref ? <span>Affaire : <strong className="text-white">{demande.affaire_ref}</strong></span> : null}
            {demande.chantier ? <span>Chantier : <strong className="text-white">{demande.chantier}</strong></span> : null}
            {demande.client ? <span>Client : <strong className="text-white">{demande.client}</strong></span> : null}
            {demande.site ? <span>Site : <strong className="text-white">{demande.site}</strong></span> : null}
          </div>
        </div>
        <div className="min-w-[260px] max-w-[440px] rounded-[18px] border border-white/20 bg-white/[.11] p-4 text-right">
          <div className="flex flex-wrap justify-end gap-2">
            <FicheBadge s={demande.statut} />
            <FicheBadge s={demande.priorite} map={PRIO_CLS} />
          </div>
          <div className="mt-4 text-white/65 text-[11px] font-black tracking-[.12em] uppercase">Laboratoire</div>
          <div className="mt-1.5 text-[13px] font-black">{LABO_NOM[demande.labo_code] || demande.labo_code || '—'}</div>
          {urgDate !== null ? (
            <div className={`mt-2 text-[12px] font-black ${urgDate < 0 ? 'text-[#ff6b6b]' : urgDate <= 7 ? 'text-[#ffcc00]' : 'text-white/70'}`}>
              {urgDate < 0 ? `Échéance dépassée (${Math.abs(Math.round(urgDate))}j)` : `Échéance dans ${Math.round(urgDate)}j`}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function AffaireHero({ affaire, badgeLabel = 'RaLab 5 · Affaire RST' }) {
  if (!affaire) return null
  return (
    <section className="overflow-hidden rounded-[26px] border border-[#dbe1ea] bg-white" style={{ boxShadow: '0 10px 34px rgba(0,49,112,0.08)' }}>
      <div
        className="relative flex flex-wrap justify-between gap-6 text-white px-[30px] pt-[30px] pb-7"
        style={{ background: 'linear-gradient(135deg, #003170 0%, #00224f 74%, #001a3d 100%)' }}
      >
        <div className="absolute right-0 bottom-0 w-[270px] h-2.5 bg-[#ffcc00] rounded-tl-full" />
        <div>
          <div className="inline-flex items-center gap-2 mb-3.5 rounded-full border border-[rgba(255,204,0,0.55)] bg-[rgba(255,204,0,0.12)] px-2.5 py-1.5 text-[11px] font-black tracking-[.12em] uppercase">
            <span className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }} />
            {badgeLabel}
          </div>
          <h1 className="text-[32px] font-black leading-none tracking-tight m-0">{affaire.reference}</h1>
          <div className="mt-3 text-[20px] font-black">{affaire.chantier || '—'}</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 text-[13px] text-white/80">
            {affaire.client ? <span>Client : <strong className="text-white">{affaire.client}</strong></span> : null}
            {affaire.site ? <span>Site : <strong className="text-white">{affaire.site}</strong></span> : null}
            {affaire.responsable ? <span>Responsable : <strong className="text-white">{affaire.responsable}</strong></span> : null}
          </div>
        </div>
        <div className="min-w-[260px] max-w-[440px] rounded-[18px] border border-white/20 bg-white/[.11] p-4 text-right">
          <div className="flex flex-wrap justify-end gap-2">
            <FicheBadge s={affaire.statut} />
            {affaire.titulaire ? (
              <span className="inline-flex items-center rounded-full px-2.5 py-1.5 text-[11px] font-black leading-none bg-[#002C77] text-white">
                {affaire.titulaire}
              </span>
            ) : null}
          </div>
          <div className="mt-4 text-white/65 text-[11px] font-black tracking-[.12em] uppercase">Demandes</div>
          <div className="mt-1.5 text-[13px] font-black">
            {affaire.nb_demandes_actives ?? 0} active{(affaire.nb_demandes_actives ?? 0) !== 1 ? 's' : ''} / {affaire.nb_demandes ?? 0}
          </div>
          {affaire.date_ouverture ? (
            <div className="mt-2 text-[12px] font-black text-white/70">Ouverture {formatDate(affaire.date_ouverture)}</div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function FichePageShell({ children }) {
  return (
    <div className="flex flex-col h-full -m-6 overflow-x-hidden" style={{ background: PAGE_BG }}>
      {children}
    </div>
  )
}

export function FicheMain({ children }) {
  return <div className="w-full max-w-full mx-auto px-7 py-4 flex flex-col gap-4">{children}</div>
}
