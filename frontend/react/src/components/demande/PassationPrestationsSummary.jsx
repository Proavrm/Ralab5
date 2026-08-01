import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import {
  buildPrestationFollowUp,
  resolvePrestationDomainCode,
} from '@/lib/rstPrestationTemplates'

function StatusBadge({ status }) {
  const normalized = String(status || '').trim()
  const tone = normalized === 'Requis'
    ? 'border-[#dbeafe] bg-[#eef5ff] text-[#003170]'
    : normalized === 'À confirmer'
      ? 'border-[#f1d77a] bg-[#fff9df] text-[#6f5700]'
      : 'border-[#dbe1ea] bg-[#f8fafc] text-[#69758a]'

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone}`}>
      {normalized || '—'}
    </span>
  )
}

function PrestationCard({ item, followUp, onFollowUp }) {
  return (
    <article className="rounded-[14px] border border-[#dbe1ea] bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#edf1f7] px-4 py-3">
        <span className="rounded-full bg-[#003170] px-2 py-0.5 text-[10px] font-black tracking-[.08em] text-white">
          {resolvePrestationDomainCode(item.need_code)}
        </span>
        <div className="min-w-0 flex-1 text-[14px] font-black text-[#172033]">
          {item.need_label || item.need_code || 'Prestation'}
        </div>
        <StatusBadge status={item.request_status} />
        {followUp ? (
          <Button size="sm" onClick={() => onFollowUp?.(followUp)}>
            {followUp.label}
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 p-4">
        {item.description ? (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-[#69758a]">
              Description / résultat attendu (haut niveau)
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#172033]">{item.description}</p>
          </div>
        ) : null}
        {item.quantity ? (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-[#69758a]">Volume estimé</div>
            <p className="mt-1 text-[13px] text-[#172033]">{item.quantity}</p>
          </div>
        ) : null}
        {item.notes ? (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-[#69758a]">Notes passation</div>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#172033]">{item.notes}</p>
          </div>
        ) : null}
      </div>
    </article>
  )
}

export default function PassationPrestationsSummary({
  prestations = [],
  passationReference = '',
  passationHref = '',
  followUpContext = null,
  intro = 'Cadrage issu de la passation (section E). Lecture seule — le détail technique, les essais et les campagnes se traitent en Préparation.',
}) {
  const navigate = useNavigate()
  const activePrestations = prestations.filter(
    (item) => !['Annulé', 'Hors périmètre'].includes(String(item.request_status || '').trim())
  )

  function handleFollowUp(followUp) {
    if (!followUp?.href) return
    navigate(followUp.href)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[10px] border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3 text-[12px] leading-relaxed text-[#69758a]">
        {intro}
      </div>

      {activePrestations.length ? (
        <div className="flex flex-col gap-3">
          {activePrestations.map((item, index) => {
            const followUp = followUpContext
              ? buildPrestationFollowUp(item, followUpContext)
              : null
            return (
              <PrestationCard
                key={item.uid || `${item.need_code}-${index}`}
                item={item}
                followUp={followUp}
                onFollowUp={handleFollowUp}
              />
            )
          })}
        </div>
      ) : (
        <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-6 text-center text-[13px] text-[#69758a]">
          Aucune prestation RST renseignée sur la passation d’origine.
        </div>
      )}

      {passationHref ? (
        <p className="text-[11px] text-text-muted">
          Passation d’origine{passationReference ? ` ${passationReference}` : ''} :{' '}
          <a href={passationHref} target="_blank" rel="noopener noreferrer" className="font-bold text-[#003170] hover:underline">
            consultation seule
          </a>
        </p>
      ) : null}
    </div>
  )
}
