import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Input from '@/components/ui/Input'
import { Card, FG, FR, num, rnd } from '@/components/essais/essaiFormUi'
import { api } from '@/services/api'
import { weWMoyenFromResultats } from '@/lib/weEssai'
import { pickWEForUsage } from '@/lib/vbsEssai'

function siblingList(raw) {
  return Array.isArray(raw) ? raw : (raw?.items || raw?.results || [])
}

export default function LimitesAtterbergForm({ res, onChange, readOnly, essai }) {
  const initial = {
    wl: res?.wl ?? '',
    wp: res?.wp ?? '',
    ip: res?.ip ?? '',
    wnat: res?.wnat ?? '',
  }
  const [values, setValues] = useState(initial)
  const echantillonId = essai?.echantillon_id
  const { data: essaisByEchantillon } = useQuery({
    queryKey: ['essais-by-echantillon', String(echantillonId || '')],
    queryFn: () => api.get(`/essais?echantillon_id=${echantillonId}`),
    enabled: Boolean(echantillonId),
  })
  const siblings = siblingList(essaisByEchantillon)
  const prefilled = useRef(false)

  useEffect(() => {
    setValues({
      wl: res?.wl ?? '',
      wp: res?.wp ?? '',
      ip: res?.ip ?? '',
      wnat: res?.wnat ?? '',
    })
  }, [res])

  useEffect(() => {
    if (readOnly || !echantillonId || prefilled.current) return
    const next = {
      wl: res?.wl ?? '',
      wp: res?.wp ?? '',
      ip: res?.ip ?? '',
      wnat: res?.wnat ?? '',
    }
    let changed = false
    if (String(next.wnat ?? '').trim() === '') {
      const weWn = pickWEForUsage(siblings, essai?.uid, 'wn')
      const w = weWn ? weWMoyenFromResultats(weWn.resultats) : null
      if (w != null && w !== '') {
        next.wnat = String(w)
        changed = true
      }
    }
    if (String(next.wl ?? '').trim() === '') {
      const weWl = pickWEForUsage(siblings, essai?.uid, 'wl')
      const w = weWl ? weWMoyenFromResultats(weWl.resultats) : null
      if (w != null && w !== '') {
        next.wl = String(w)
        changed = true
      }
    }
    if (String(next.wp ?? '').trim() === '') {
      const weWp = pickWEForUsage(siblings, essai?.uid, 'wp')
      const w = weWp ? weWMoyenFromResultats(weWp.resultats) : null
      if (w != null && w !== '') {
        next.wp = String(w)
        changed = true
      }
    }
    if (!changed) {
      if (essaisByEchantillon != null || !echantillonId) prefilled.current = true
      return
    }
    prefilled.current = true
    if (num(next.wl) !== null && num(next.wp) !== null) {
      next.ip = String(rnd(num(next.wl) - num(next.wp), 3))
    }
    setValues(next)
    onChange(JSON.stringify({
      wl: next.wl === '' ? null : num(next.wl),
      wp: next.wp === '' ? null : num(next.wp),
      ip: next.ip === '' ? null : num(next.ip),
      wnat: next.wnat === '' ? null : num(next.wnat),
    }))
  }, [readOnly, echantillonId, siblings, essai?.uid, res, onChange])

  const wlNum = num(values.wl)
  const wpNum = num(values.wp)
  const computedIp = wlNum !== null && wpNum !== null ? rnd(wlNum - wpNum, 3) : num(values.ip)

  function emit(nextValues) {
    onChange(JSON.stringify({
      wl: nextValues.wl === '' ? null : num(nextValues.wl),
      wp: nextValues.wp === '' ? null : num(nextValues.wp),
      ip: nextValues.ip === '' ? null : num(nextValues.ip),
      wnat: nextValues.wnat === '' ? null : num(nextValues.wnat),
    }))
  }

  function updateField(key, rawValue) {
    const next = { ...values, [key]: rawValue }
    if ((key === 'wl' || key === 'wp') && num(next.wl) !== null && num(next.wp) !== null) {
      next.ip = String(rnd(num(next.wl) - num(next.wp), 3))
    }
    setValues(next)
    emit(next)
  }

  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          {wlNum !== null ? (
            <div className="rounded-lg border border-[#90bfe8] bg-[#e6f1fb] px-5 py-3 text-center">
              <div className="text-[26px] font-bold leading-none text-[#185fa5]">{wlNum} %</div>
              <div className="mt-1 text-[11px] font-medium text-[#185fa5]">wL</div>
            </div>
          ) : null}
          {wpNum !== null ? (
            <div className="rounded-lg border border-[#d5c2a4] bg-[#f5efe5] px-5 py-3 text-center">
              <div className="text-[26px] font-bold leading-none text-[#7a5c2e]">{wpNum} %</div>
              <div className="mt-1 text-[11px] font-medium text-[#7a5c2e]">wP</div>
            </div>
          ) : null}
          {computedIp !== null ? (
            <div className="rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3 text-center">
              <div className="text-[26px] font-bold leading-none text-[#3b6d11]">{computedIp} %</div>
              <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">Ip</div>
            </div>
          ) : null}
        </div>
        <Card title="Limites d'Atterberg">
          <div className="grid grid-cols-4 gap-4">
            <FR label="wL" value={wlNum !== null ? `${wlNum} %` : null} />
            <FR label="wP" value={wpNum !== null ? `${wpNum} %` : null} />
            <FR label="Ip" value={computedIp !== null ? `${computedIp} %` : null} />
            <FR label="Wn" value={num(values.wnat) !== null ? `${num(values.wnat)} %` : null} />
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Limites d'Atterberg">
        <p className="mb-3 text-[11px] italic text-text-muted">
          wL / wP / Wn se préremplissent depuis les WE du même échantillon (usages wl, wp, wn) s'ils existent, sans écraser une saisie.
        </p>
        <div className="grid grid-cols-4 gap-3">
          <FG label="wL (%)">
            <Input type="number" step="0.01" value={values.wl} onChange={(event) => updateField('wl', event.target.value)} />
          </FG>
          <FG label="wP (%)">
            <Input type="number" step="0.01" value={values.wp} onChange={(event) => updateField('wp', event.target.value)} />
          </FG>
          <FG label="Ip (%)">
            <Input type="number" step="0.01" value={values.ip} onChange={(event) => updateField('ip', event.target.value)} />
          </FG>
          <FG label="Wn (%)">
            <Input type="number" step="0.01" value={values.wnat} onChange={(event) => updateField('wnat', event.target.value)} />
          </FG>
        </div>
      </Card>
    </div>
  )
}
