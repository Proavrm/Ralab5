import React, { useMemo, useState } from 'react'
import { DashboardHero, FicheMain, FichePageShell } from '@/components/layout/FicheLayout'

const eventRows = [
  {
    id: '2026-RA-FNC0001',
    register: 'FNC',
    date: '12/02/2026',
    eventDate: '2025',
    agency: 'RL GT',
    chantier: 'RAN63C',
    title: 'Liste FNC T6 - reseaux / voirie',
    family: 'Technique / interfaces',
    status: 'Backlog 2025',
    cost: 43140,
    owner: 'Conducteur travaux',
    action: 'A requalifier',
    backlog: true,
    tone: 'amber',
  },
  {
    id: '2026-RA-FNC0081',
    register: 'FNC',
    date: '18/02/2026',
    eventDate: '18/02/2026',
    agency: 'AUV EHTP',
    chantier: 'RAP22K',
    title: 'Absence de controle sur tranchees AEP',
    family: 'Absence de controle',
    status: 'Action en cours',
    cost: 25000,
    owner: 'Responsable travaux',
    action: 'Plan controle a formaliser',
    backlog: false,
    tone: 'red',
  },
  {
    id: '2026-RA-FAE0014',
    register: 'FAE',
    date: '04/03/2026',
    eventDate: '04/03/2026',
    agency: 'RL TU',
    chantier: 'RAQ18B',
    title: 'Depart de boue vers avaloir apres pluie',
    family: 'Environnement / eaux',
    status: 'Mesure immediate faite',
    cost: 1200,
    owner: 'QSE chantier',
    action: 'Renforcer protection avaloirs',
    backlog: false,
    tone: 'green',
  },
  {
    id: '2026-RA-BP0007',
    register: 'BP',
    date: '11/03/2026',
    eventDate: '11/03/2026',
    agency: 'AUV',
    chantier: 'RAP56C',
    title: 'Pre-check enrobes avant intervention de nuit',
    family: 'Bonne pratique / controle',
    status: 'A diffuser',
    cost: 0,
    owner: 'Labo / travaux',
    action: 'Transformer en support 1/4h qualite',
    backlog: false,
    tone: 'blue',
  },
  {
    id: '2026-RA-RI0023',
    register: 'INFO',
    date: '22/03/2026',
    eventDate: '22/03/2026',
    agency: 'AIN',
    chantier: 'RAP99A',
    title: 'Risque recurrent de confusion de plans indice B/C',
    family: 'Remontee d info / prevention',
    status: 'A analyser',
    cost: 0,
    owner: 'Methodes / travaux',
    action: 'Creer alerte prevention documentaire',
    backlog: false,
    tone: 'slate',
  },
  {
    id: '2026-RA-FNC0097',
    register: 'FNC',
    date: '05/03/2026',
    eventDate: '05/03/2026',
    agency: 'AIN',
    chantier: 'RAP99A',
    title: 'Fuite reseau incendie',
    family: 'Methode de travail',
    status: 'Ouverte',
    cost: 20000,
    owner: 'Chef de secteur',
    action: 'Analyse cause racine',
    backlog: false,
    tone: 'red',
  },
  {
    id: '2026-RA-FAE0021',
    register: 'FAE',
    date: '08/04/2026',
    eventDate: '08/04/2026',
    agency: 'LHL',
    chantier: 'RAQ31D',
    title: 'Stockage provisoire materiaux a clarifier',
    family: 'Environnement / stockage',
    status: 'Action en cours',
    cost: 0,
    owner: 'Chef chantier',
    action: 'Definir zone balisee et photo preuve',
    backlog: false,
    tone: 'green',
  },
  {
    id: '2026-RA-BP0012',
    register: 'BP',
    date: '15/04/2026',
    eventDate: '15/04/2026',
    agency: 'RL GT',
    chantier: 'RAQ40F',
    title: 'Planche photo autocontrole avant remblaiement',
    family: 'Bonne pratique / tracabilite',
    status: 'Validee',
    cost: 0,
    owner: 'Qualite RA',
    action: 'Diffusion agences',
    backlog: false,
    tone: 'blue',
  },
]

const actions = [
  {
    title: 'Requalifier le stock RAN63C / T6',
    pilot: 'Qualite RA',
    due: '31/05/2026',
    status: 'En cours',
    risk: 'Haut',
    register: 'FNC',
    detail:
      'Distinguer date du fait, date de remontee et date de saisie pour eviter une fausse derive 2026.',
  },
  {
    title: 'Creer typologie causes RaLab',
    pilot: 'RST / Qualite',
    due: '15/06/2026',
    status: 'A faire',
    risk: 'Moyen',
    register: 'FNC',
    detail: 'Remplacer le grand sac TECHNIQUE par des familles exploitables en REX.',
  },
  {
    title: 'Formaliser les FAE environnement',
    pilot: 'QSE / Exploitation',
    due: '20/06/2026',
    status: 'A faire',
    risk: 'Moyen',
    register: 'FAE',
    detail: 'Separer incident environnement, action environnementale et simple observation terrain.',
  },
  {
    title: 'Transformer les BP en supports diffusables',
    pilot: 'Qualite RA',
    due: '30/06/2026',
    status: 'A faire',
    risk: 'Faible',
    register: 'BP',
    detail: 'Creer un circuit validation puis diffusion 1/4h qualite, environnement ou securite.',
  },
  {
    title: 'Trier les remontees d infos utiles',
    pilot: 'Methodes / RST',
    due: '15/07/2026',
    status: 'A cadrer',
    risk: 'Moyen',
    register: 'INFO',
    detail: 'Permettre a une remontee d info de devenir FNC, FAE, BP ou action preventive.',
  },
]

const causeData = [
  { label: 'Technique / interfaces', value: 82 },
  { label: 'Erreur humaine / rigueur', value: 30 },
  { label: 'Environnement / eaux', value: 14 },
  { label: 'Communication', value: 8 },
  { label: 'Methode', value: 7 },
]

const monthlyData = [
  { label: 'Jan', all: 27, clean: 21, fae: 4, bp: 2, info: 5 },
  { label: 'Fev', all: 87, clean: 19, fae: 5, bp: 4, info: 7 },
  { label: 'Mar', all: 29, clean: 26, fae: 8, bp: 5, info: 10 },
  { label: 'Avr', all: 13, clean: 11, fae: 6, bp: 6, info: 8 },
]

const registerConfig = {
  ALL: {
    label: 'Tous registres',
    description: 'Vue consolidee QSSE avec FNC, FAE, BP et remontees d infos.',
  },
  FNC: {
    label: 'Registre FNC',
    description: 'Non-conformites, couts, causes, traitements et actions correctives.',
  },
  FAE: {
    label: 'Registre FAE',
    description: 'Fiches action/environnement, mesures immediates et suivi QSE.',
  },
  BP: {
    label: 'Registre BP',
    description: 'Bonnes pratiques validables, diffusables et transformables en REX.',
  },
  INFO: {
    label: 'Remontees d infos',
    description: 'Signaux faibles, alertes terrain, idees amelioration et prevention.',
  },
}

function formatMoney(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

function StatCard({ label, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50 text-blue-950',
    amber: 'border-amber-100 bg-amber-50 text-amber-950',
    red: 'border-red-100 bg-red-50 text-red-950',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-950',
    slate: 'border-slate-100 bg-slate-50 text-slate-950',
  }

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-xs opacity-80">{sub}</div>
    </div>
  )
}

function Pill({ children, tone = 'slate' }) {
  const tones = {
    blue: 'bg-blue-100 text-blue-900',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-900',
    green: 'bg-emerald-100 text-emerald-900',
    slate: 'bg-slate-100 text-slate-700',
    dark: 'bg-slate-900 text-white',
  }

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}

function RegisterBadge({ register }) {
  const tones = {
    FNC: 'red',
    FAE: 'green',
    BP: 'blue',
    INFO: 'slate',
  }

  return <Pill tone={tones[register] || 'slate'}>{register}</Pill>
}

function BarList({ data, valueKey = 'value', maxValue }) {
  const max = maxValue || Math.max(...data.map((item) => item[valueKey]))

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
            <span className="font-medium">{item.label}</span>
            <span>{item[valueKey]}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900"
              style={{ width: `${Math.max(6, (item[valueKey] / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function MonthlyBars({ cleanView, registerFilter }) {
  const values = monthlyData.map((item) => {
    if (registerFilter === 'FAE') return item.fae
    if (registerFilter === 'BP') return item.bp
    if (registerFilter === 'INFO') return item.info
    return cleanView ? item.clean : item.all
  })

  const max = Math.max(...values)

  return (
    <div className="flex h-44 items-end gap-4 rounded-2xl bg-white p-4">
      {monthlyData.map((item, index) => {
        const value = values[index]
        return (
          <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-32 w-full items-end rounded-xl bg-slate-50 px-2">
              <div
                className="w-full rounded-t-xl bg-blue-900"
                style={{ height: `${Math.max(10, (value / max) * 100)}%` }}
              />
            </div>
            <div className="text-xs font-bold text-slate-700">{item.label}</div>
            <div className="text-xs text-slate-500">{value}</div>
          </div>
        )
      })}
    </div>
  )
}

function DataQualityPanel() {
  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-950">Alertes pilotage</h3>
          <p className="mt-1 text-xs text-slate-500">Points a corriger avant exploitation direction.</p>
        </div>
        <Pill tone="red">12 alertes</Pill>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <div className="text-sm font-bold text-amber-950">Backlog RAN63C / T6</div>
          <p className="mt-1 text-xs text-amber-900">79 FNC saisies en 2026 mais rattachees a des faits 2025.</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
          <div className="text-sm font-bold text-red-950">Actions correctives manquantes</div>
          <p className="mt-1 text-xs text-red-900">FNC a verrouiller avant cloture si cause ou action absente.</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
          <div className="text-sm font-bold text-emerald-950">FAE a distinguer</div>
          <p className="mt-1 text-xs text-emerald-900">Separer incident environnement, action environnementale et simple observation.</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
          <div className="text-sm font-bold text-blue-950">BP a diffuser</div>
          <p className="mt-1 text-xs text-blue-900">Les bonnes pratiques doivent pouvoir devenir REX ou support 1/4h.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-bold text-slate-950">Remontees d infos a trier</div>
          <p className="mt-1 text-xs text-slate-600">Une info peut devenir FNC, FAE, BP, action ou simple veille.</p>
        </div>
      </div>
    </aside>
  )
}

function DashboardView({ cleanView, dateMode, registerFilter }) {
  const stats = useMemo(() => {
    const fncRows = eventRows.filter((row) => row.register === 'FNC')
    const visibleFnc = cleanView ? fncRows.filter((row) => !row.backlog) : fncRows

    return {
      fnc: visibleFnc.length,
      fae: eventRows.filter((row) => row.register === 'FAE').length,
      bp: eventRows.filter((row) => row.register === 'BP').length,
      info: eventRows.filter((row) => row.register === 'INFO').length,
      cost:
        visibleFnc.reduce((sum, row) => sum + row.cost, 0) +
        eventRows.filter((row) => row.register === 'FAE').reduce((sum, row) => sum + row.cost, 0),
    }
  }, [cleanView])

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <section className="space-y-4 xl:col-span-9">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="FNC" value={stats.fnc} sub={cleanView ? 'Hors backlog' : 'Avec backlog'} tone="red" />
          <StatCard label="FAE" value={stats.fae} sub="Actions / evenements env." tone="green" />
          <StatCard label="BP" value={stats.bp} sub="Bonnes pratiques" tone="blue" />
          <StatCard label="Infos" value={stats.info} sub="Signaux faibles" tone="slate" />
          <StatCard label="Cout" value={formatMoney(stats.cost)} sub="FNC + FAE renseignees" tone="amber" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-950">Evolution mensuelle</h3>
                <p className="text-xs text-slate-500">Lecture actuelle : {dateMode}</p>
              </div>
              <Pill tone={cleanView ? 'green' : 'amber'}>{cleanView ? 'Vue nettoyee' : 'Vue brute'}</Pill>
            </div>
            <MonthlyBars cleanView={cleanView} registerFilter={registerFilter} />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-950">Pareto familles</h3>
                <p className="text-xs text-slate-500">FNC, FAE, BP et infos reclassables.</p>
              </div>
              <Pill tone="dark">Top 5</Pill>
            </div>
            <BarList data={causeData} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-950">Evenements prioritaires</h3>
              <p className="text-xs text-slate-500">Liste courte pour arbitrage qualite, environnement, travaux et REX.</p>
            </div>
            <button className="rounded-xl bg-blue-950 px-4 py-2 text-xs font-bold text-white shadow-sm">Nouvel evenement</button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Registre</th>
                  <th className="px-3 py-3">N°</th>
                  <th className="px-3 py-3">Chantier</th>
                  <th className="px-3 py-3">Famille</th>
                  <th className="px-3 py-3">Statut</th>
                  <th className="px-3 py-3 text-right">Cout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {eventRows.filter((row) => !cleanView || !row.backlog).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3"><RegisterBadge register={row.register} /></td>
                    <td className="px-3 py-3 font-bold text-slate-900">{row.id}</td>
                    <td className="px-3 py-3 text-slate-700">{row.chantier}</td>
                    <td className="px-3 py-3 text-slate-700">{row.family}</td>
                    <td className="px-3 py-3"><Pill tone={row.tone}>{row.status}</Pill></td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">{row.cost ? formatMoney(row.cost) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="xl:col-span-3">
        <DataQualityPanel />
      </section>
    </div>
  )
}

function RegisterView({ cleanView, registerFilter }) {
  const rows = eventRows.filter((row) => {
    if (cleanView && row.backlog) return false
    if (registerFilter === 'ALL') return true
    return row.register === registerFilter
  })

  const config = registerConfig[registerFilter]

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">{config.label}</h3>
          <p className="text-sm text-slate-500">{config.description}</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Importer Excel</button>
          <button className="rounded-xl bg-blue-950 px-3 py-2 text-xs font-bold text-white">Creer</button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {['Annee', 'Registre', 'Agence', 'Chantier', 'Famille', 'Statut', 'Backlog'].map((label) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Filtre</div>
            <div className="text-sm font-semibold text-slate-700">{label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[1160px] text-left text-sm">
          <thead className="bg-slate-950 text-xs uppercase tracking-wide text-white">
            <tr>
              <th className="px-3 py-3">Registre</th>
              <th className="px-3 py-3">N°</th>
              <th className="px-3 py-3">Date saisie</th>
              <th className="px-3 py-3">Date fait</th>
              <th className="px-3 py-3">Agence</th>
              <th className="px-3 py-3">Chantier</th>
              <th className="px-3 py-3">Sujet</th>
              <th className="px-3 py-3">Action</th>
              <th className="px-3 py-3 text-right">Cout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-3 py-3"><RegisterBadge register={row.register} /></td>
                <td className="px-3 py-3 font-black text-blue-950">{row.id}</td>
                <td className="px-3 py-3 text-slate-600">{row.date}</td>
                <td className="px-3 py-3 text-slate-600">{row.eventDate}</td>
                <td className="px-3 py-3 text-slate-600">{row.agency}</td>
                <td className="px-3 py-3 font-semibold text-slate-900">{row.chantier}</td>
                <td className="px-3 py-3 text-slate-700">{row.title}</td>
                <td className="px-3 py-3 text-slate-700">{row.action}</td>
                <td className="px-3 py-3 text-right font-bold text-slate-900">{row.cost ? formatMoney(row.cost) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({ label, value, wide = false }) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function EventFicheView() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-blue-900">Fiche evenement QSSE</div>
            <h3 className="mt-1 text-2xl font-black text-slate-950">2026-RA-FNC0001</h3>
            <p className="mt-1 text-sm text-slate-500">RAN63C / Liste FNC T6 - regularisation de faits 2025</p>
          </div>
          <div className="flex gap-2">
            <RegisterBadge register="FNC" />
            <Pill tone="amber">Backlog 2025</Pill>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Registre" value="FNC" />
          <Field label="Type RaLab" value="Non-conformite qualite" />
          <Field label="Date du fait" value="2025 a confirmer" />
          <Field label="Date de remontee" value="Fevrier 2026" />
          <Field label="Date de saisie" value="12/02/2026" />
          <Field label="Date de cloture" value="Non cloturee" />
          <Field label="Agence" value="RL GT" />
          <Field label="Chantier" value="RAN63C" />
          <Field label="Famille RaLab" value="Technique / interfaces chantier" />
          <Field label="Criticite" value="Majeure" />
          <Field
            label="Constat"
            value="Degradations et reprises multiples identifiees dans la liste FNC T6. Les faits sont rattaches a 2025 mais remontes tardivement."
            wide
          />
          <Field
            label="Cause identifiee"
            value="Remontee tardive, qualification technique a reprendre, chantier T6 a consolider."
            wide
          />
          <Field
            label="Traitement immediat"
            value="Rattacher au bon exercice operationnel et verifier les doublons avec le registre 2025."
            wide
          />
          <Field
            label="Action corrective"
            value="Nettoyer la codification RAN63C/T6 et imposer date du fait + date de remontee dans RaLab."
            wide
          />
        </div>
      </section>

      <aside className="space-y-4 xl:col-span-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-black text-slate-950">Conversion possible</h4>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-950">FNC</button>
            <button className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-950">FAE</button>
            <button className="rounded-2xl bg-blue-50 p-3 text-sm font-bold text-blue-950">BP</button>
            <button className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700">Info</button>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Une remontee d info peut etre qualifiee ensuite comme FNC, FAE, bonne pratique ou simple veille.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-black text-slate-950">Liens RaLab</h4>
          <div className="mt-3 space-y-2">
            <div className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">Affaire : RAN63C</div>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">Source : Registre FNC 2026</div>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">Import : Batch QSSE-2026-001</div>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">Doublons : 5 suspects 2025</div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-black text-slate-950">Checklist cloture</h4>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-emerald-950"><span>Constat renseigne</span><span>OK</span></div>
            <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-amber-950"><span>Date du fait</span><span>A confirmer</span></div>
            <div className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-red-950"><span>Action corrective</span><span>A completer</span></div>
            <div className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-red-950"><span>Cout valide</span><span>Non</span></div>
          </div>
        </div>
      </aside>
    </div>
  )
}

function ActionsView() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {actions.map((action) => (
        <div key={action.title} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-black text-slate-950">{action.title}</h3>
            <RegisterBadge register={action.register} />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{action.detail}</p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
            <div><span className="font-bold">Pilote : </span>{action.pilot}</div>
            <div><span className="font-bold">Echeance : </span>{action.due}</div>
            <div><span className="font-bold">Statut : </span>{action.status}</div>
            <div><span className="font-bold">Risque : </span>{action.risk}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function RexView() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-7">
        <div className="mb-4">
          <div className="text-xs font-bold uppercase tracking-widest text-blue-900">REX automatique</div>
          <h3 className="mt-1 text-2xl font-black text-slate-950">Du signal faible a la bonne pratique</h3>
          <p className="mt-1 text-sm text-slate-500">Fiche generee a partir des FNC, FAE, BP et remontees d infos.</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-black text-slate-950">Constat</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">Les registres ne doivent pas rester separes. Une information terrain peut annoncer une future FNC, une FAE peut produire une action preventive, et une BP peut devenir un standard regional.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-black text-slate-950">Enseignement</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">Le suivi QSSE doit mesurer les ecarts, mais aussi les apprentissages. Sinon on collectionne les problemes et on oublie les antidotes.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-black text-slate-950">Action preventive</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">Creer un workflow unique : remontee d info -> qualification -> FNC, FAE, BP ou action -> validation -> diffusion REX.</p>
          </div>
        </div>
      </section>

      <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-5">
        <h3 className="text-sm font-black text-slate-950">Formats export possibles</h3>
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-950">
            <div className="font-black">Fiche REX PDF</div>
            <p className="mt-1">Une page synthetique pour direction, qualite, environnement et travaux.</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
            <div className="font-black">Support 1/4h environnement</div>
            <p className="mt-1">Version courte issue des FAE ou incidents environnement.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-black">Support 1/4h qualite</div>
            <p className="mt-1">Version courte issue des FNC, BP ou remontees d infos.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-black">Plan d actions</div>
            <p className="mt-1">Actions curatives, correctives, preventives et diffusion.</p>
          </div>
        </div>
      </aside>
    </div>
  )
}

function WorkflowView() {
  const steps = [
    { title: 'Remontee d info', text: 'Signal faible, remarque terrain, suggestion ou alerte.' },
    { title: 'Qualification', text: 'Choix du registre : FNC, FAE, BP ou veille simple.' },
    { title: 'Traitement', text: 'Mesure immediate, analyse cause, action et pilote.' },
    { title: 'Validation', text: 'Cloture controlee, preuve et cout si necessaire.' },
    { title: 'REX', text: 'Capitalisation, diffusion et support 1/4h.' },
  ]

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <div className="text-xs font-bold uppercase tracking-widest text-blue-900">Workflow QSSE</div>
        <h3 className="mt-1 text-2xl font-black text-slate-950">Un seul flux, plusieurs registres</h3>
        <p className="mt-1 text-sm text-slate-500">Le registre n est pas choisi trop tot. RaLab laisse d abord remonter l information, puis la qualifie.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => (
          <div key={step.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-950 text-sm font-black text-white">{index + 1}</div>
            <h4 className="text-sm font-black text-slate-950">{step.title}</h4>
            <p className="mt-2 text-xs leading-5 text-slate-600">{step.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-3xl bg-blue-950 p-4 text-white">
        <div className="text-sm font-black">Regle RaLab proposee</div>
        <p className="mt-2 text-sm leading-6 text-blue-100">Toute remontee peut rester une information, ou etre convertie en FNC, FAE, BP ou action preventive. La conversion garde l historique complet pour eviter les pertes de tracabilite.</p>
      </div>
    </div>
  )
}

export default function QsseFncRaLabMockupPage() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [cleanView, setCleanView] = useState(false)
  const [dateMode, setDateMode] = useState('date de saisie')
  const [registerFilter, setRegisterFilter] = useState('ALL')

  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'register', label: 'Registres' },
    { key: 'fiche', label: 'Fiche' },
    { key: 'actions', label: 'Plan d actions' },
    { key: 'rex', label: 'REX' },
    { key: 'workflow', label: 'Workflow' },
  ]

  return (
    <FichePageShell>
      <DashboardHero
        eyebrow="RaLab · Mockup QSSE"
        title="QSSE / FNC / FAE / BP / Infos"
        subtitle="Mockup d’un module capable de gérer les non-conformités, actions ou événements environnement, bonnes pratiques, remontées d’infos, imports historiques et REX."
        aside={(
          <div className="rounded-2xl border border-white/20 bg-white/10 p-3 text-right backdrop-blur">
            <div className="text-xs uppercase tracking-wide text-white/70">Vue actuelle</div>
            <div className="text-lg font-black">{cleanView ? 'Hors backlog' : 'Registre complet'}</div>
          </div>
        )}
      />

      <FicheMain className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <nav className="rounded-3xl border border-border bg-white p-2 shadow-sm xl:col-span-6">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
                    activeTab === tab.key
                      ? 'bg-nge text-white shadow-sm'
                      : 'text-text-muted hover:bg-bg'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="rounded-3xl border border-border bg-white p-3 shadow-sm xl:col-span-6">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <select
                value={registerFilter}
                onChange={(event) => setRegisterFilter(event.target.value)}
                className="rounded-2xl border border-border bg-bg px-3 py-2 text-sm font-semibold text-text outline-none focus:border-nge"
              >
                <option value="ALL">Tous registres</option>
                <option value="FNC">Registre FNC</option>
                <option value="FAE">Registre FAE</option>
                <option value="BP">Registre BP</option>
                <option value="INFO">Remontees d infos</option>
              </select>
              <select
                value={dateMode}
                onChange={(event) => setDateMode(event.target.value)}
                className="rounded-2xl border border-border bg-bg px-3 py-2 text-sm font-semibold text-text outline-none focus:border-nge"
              >
                <option>date de saisie</option>
                <option>date du fait</option>
                <option>date de remontee</option>
                <option>date de cloture</option>
              </select>
              <button
                onClick={() => setCleanView((value) => !value)}
                className={`rounded-2xl px-3 py-2 text-sm font-bold transition ${
                  cleanView ? 'bg-emerald-100 text-emerald-950' : 'bg-amber-100 text-amber-950'
                }`}
              >
                {cleanView ? 'Backlog exclu' : 'Inclure backlog'}
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <DashboardView cleanView={cleanView} dateMode={dateMode} registerFilter={registerFilter} />
        )}
        {activeTab === 'register' && (
          <RegisterView cleanView={cleanView} registerFilter={registerFilter} />
        )}
        {activeTab === 'fiche' && <EventFicheView />}
        {activeTab === 'actions' && <ActionsView />}
        {activeTab === 'rex' && <RexView />}
        {activeTab === 'workflow' && <WorkflowView />}
      </FicheMain>
    </FichePageShell>
  )
}
