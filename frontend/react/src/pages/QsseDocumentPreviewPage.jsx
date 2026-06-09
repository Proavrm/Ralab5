import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

function normalizePreviewSrc(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('/api/storage/qsse/fnc/')) return raw
  if (raw.startsWith('/storage/qsse/fnc/')) return raw
  return ''
}

export default function QsseDocumentPreviewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const previewSrc = useMemo(() => normalizePreviewSrc(searchParams.get('src')), [searchParams])
  const title = useMemo(() => String(searchParams.get('name') || 'Document QSSE').trim() || 'Document QSSE', [searchParams])

  return (
    <div className="flex h-full min-h-screen flex-col bg-[#f5f7fa] text-[#1f2630]">
      <div className="flex items-center justify-between gap-3 border-b border-[#d8dde6] bg-white px-5 py-4">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.08em] text-[#003275]">Visualisation PDF</div>
          <h1 className="truncate text-[18px] font-bold">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-[34px] rounded-[6px] border border-[#d8dde6] bg-white px-3 text-[12px] font-bold text-[#1f2630]"
            onClick={() => navigate(-1)}
          >
            Retour
          </button>
          {previewSrc && (
            <a
              className="inline-flex h-[34px] items-center justify-center rounded-[6px] border border-[#003275] bg-[#003275] px-3 text-[12px] font-bold text-white no-underline"
              href={previewSrc}
              target="_blank"
              rel="noreferrer"
            >
              Ouvrir le PDF seul
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 p-5">
        {!previewSrc ? (
          <div className="flex h-full min-h-[320px] items-center justify-center rounded-[16px] border border-[#d8dde6] bg-white p-8 text-center text-[14px] text-[#6f7681]">
            URL de document invalide ou absente.
          </div>
        ) : (
          <div className="flex h-full min-h-[640px] flex-col overflow-hidden rounded-[16px] border border-[#d8dde6] bg-white shadow-[0_18px_40px_rgba(31,38,48,0.08)]">
            <iframe
              title={title}
              src={previewSrc}
              className="h-full min-h-[640px] w-full border-0 bg-white"
            />
          </div>
        )}
      </div>
    </div>
  )
}
