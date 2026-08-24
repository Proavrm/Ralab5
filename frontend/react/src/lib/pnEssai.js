import { num, rnd } from '@/components/essais/essaiFormUi'

export function polyFit2(pts) {
  // Régression polynomiale degré 2 (moindres carrés): y = c0 + c1·x + c2·x²
  const n = pts.length
  if (n < 3) return null
  let s1=0, s2=0, s3=0, s4=0, sy=0, sw1y=0, sw2y=0
  for (const {x, y} of pts) {
    s1+=x; s2+=x**2; s3+=x**3; s4+=x**4
    sy+=y; sw1y+=x*y; sw2y+=x**2*y
  }
  const M = [[n,s1,s2],[s1,s2,s3],[s2,s3,s4]]
  const R = [sy, sw1y, sw2y]
  for (let i=0; i<3; i++) {
    let mx=i
    for (let j=i+1;j<3;j++) if (Math.abs(M[j][i])>Math.abs(M[mx][i])) mx=j
    ;[M[i],M[mx]]=[M[mx],M[i]];[R[i],R[mx]]=[R[mx],R[i]]
    if (Math.abs(M[i][i])<1e-12) return null
    for (let j=i+1;j<3;j++) {
      const f=M[j][i]/M[i][i]
      R[j]-=f*R[i]
      for (let k=i;k<3;k++) M[j][k]-=f*M[i][k]
    }
  }
  const c2=R[2]/M[2][2]
  const c1=(R[1]-M[1][2]*c2)/M[1][1]
  const c0=(R[0]-M[0][1]*c1-M[0][2]*c2)/M[0][0]
  if (isNaN(c0)||isNaN(c1)||isNaN(c2)) return null
  if (c2 >= 0) return null // pas de maximum → pas d'OPN
  return {c0, c1, c2}
}
export function evalPoly2({c0, c1, c2}, x) { return c0 + c1*x + c2*x*x }
export const MOULE_PRESETS = [
  { key: 'petit_pn',  label: 'Petit moule PN — Ø101.6 mm',  v: 944,  info: 'PN: 3 couches × 25 coups · PM: 5 couches × 25 coups' },
  { key: 'grand_cbr', label: 'Grand moule CBR — Ø152.4 mm', v: 2131, info: 'PM: 5 couches × 55 coups · compatible IPI / CBRi / CBR' },
  { key: 'custom',    label: 'Personnalisé',                 v: null, info: null },
]

export function calcGTRCorrection(rhoOPN, wOPN, pRefus20, gsGros) {
  if (pRefus20 === null || rhoOPN === null || wOPN === null) return null
  if (pRefus20 > 30)
    return { applicable: false, pRefus: pRefus20 }
  const a = pRefus20 / 100
  const gs = gsGros || 2.65
  const rho_corr = rnd(rhoOPN / (1 - a * (1 - rhoOPN / gs)), 3)
  const w_corr   = rnd(wOPN * (1 - a), 2)
  return { applicable: true, pRefus: pRefus20, a, rho_corr, w_corr }
}

export function initPNPoints(res) {
  if (res.points?.length) {
    // Migrate old points that don't have moule fields
    return res.points.map(p => ({
      moule_ref: '', m_moule: '', v_moule: '',
      ...p,
    }))
  }
  return Array.from({length: 6}, (_, i) => ({
    id: i + 1, actif: true,
    moule_ref: '', m_moule: '', v_moule: '',
    w: '', m1: '', m2: '', m3: '', m_tot: '',
  }))
}

export function calcPNPoint(pt, mMouleDefault, vMouleDefault) {
  // Par-point moule values have priority over global defaults
  const mm = (num(pt.m_moule) !== null && num(pt.m_moule) > 0) ? num(pt.m_moule) : num(mMouleDefault)
  const vv = (num(pt.v_moule) !== null && num(pt.v_moule) > 0) ? num(pt.v_moule) : num(vMouleDefault)
  const mt = num(pt.m_tot)
  const directRhoH = num(pt.rho_h)
  const directRhoD = num(pt.rho_d)
  // w depuis pesée M1/M2/M3 en priorité, sinon valeur directe
  let w = null
  const n1=num(pt.m1), n2=num(pt.m2), n3=num(pt.m3)
  if (n1!==null && n2!==null && n3!==null && (n3-n1)>0)
    w = rnd((n2-n3)/(n3-n1)*100, 2)
  else if (pt.w !== '')
    w = num(pt.w)
  let rho_h=null, rho_d=null
  if (mt!==null && mm!==null && vv!==null && vv>0)
    rho_h = rnd((mt-mm)/vv, 3)
  else if (directRhoH !== null)
    rho_h = directRhoH
  if (rho_h!==null && w!==null && (100+w)>0)
    rho_d = rnd(rho_h/(1+w/100), 3)
  else if (directRhoD !== null)
    rho_d = directRhoD
  if (rho_h===null && rho_d!==null && w!==null && (100+w)>0)
    rho_h = rnd(rho_d * (1 + w/100), 3)
  return {w, rho_h, rho_d}
}

export function getPNPoints(pnRes) {
  if (!pnRes?.points) return []
  return pnRes.points.map((p, idx) => {
    const c = calcPNPoint(p, pnRes.m_moule, pnRes.v_moule)
    return { id: p.id??idx+1, actif: p.actif!==false, w: c.w, rho_d: c.rho_d, moule_ref: p.moule_ref||'' }
  }).filter(p => p.actif && p.w !== null)
}

// Helper — rebuild Proctor curve from pnRes
export function buildProctorCurve(pnRes) {
  if (!pnRes?.points) return { pnCalcs: [], poly: null, wOPN: null, rhoOPN: null }
  const pnCalcs = pnRes.points.map(p => calcPNPoint(p, pnRes.m_moule, pnRes.v_moule))
  const validForPoly = pnCalcs.filter(c => c.w!==null && c.rho_d!==null)
  let poly=null, wOPN=null, rhoOPN=null
  try {
    if (validForPoly.length>=3) {
      poly = polyFit2(validForPoly.map(c=>({x:c.w,y:c.rho_d})))
      if (poly) {
        wOPN = rnd(-poly.c1/(2*poly.c2),2)
        rhoOPN = wOPN!==null ? rnd(evalPoly2(poly,wOPN),3) : null
      }
    }
  } catch {}
  wOPN   = wOPN   ?? pnRes.wOPN_corr   ?? pnRes.wOPN   ?? null
  rhoOPN = rhoOPN ?? pnRes.rho_d_OPN_corr ?? pnRes.rho_d_OPN ?? null
  return { pnCalcs, poly, wOPN, rhoOPN }
}
