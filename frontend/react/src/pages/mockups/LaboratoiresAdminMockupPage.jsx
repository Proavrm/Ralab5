import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardHero, FicheMain, FichePageShell } from '@/components/layout/FicheLayout'
import {
  Building2,
  FlaskConical,
  MapPin,
  Share2,
  Shield,
  Users,
  Wrench,
} from 'lucide-react'

const MOCK_LABS = [
  {
    code: 'SP',
    name: 'Saint-Priest',
    region: 'RA',
    is_active: true,
    address: '29-31 rue des Tâches, ZI Mi-Plaine, 69800 Saint-Priest',
    lat: 45.6969,
    lon: 4.9422,
    has_coords: true,
    staff_active_count: 12,
    responsable: { display_name: 'Sylvain LHOPITAL', email: 'slhopital@guintoli.fr' },
    equipment: { total: 84, active: 71, hs: 4, linked: true },
  },
  {
    code: 'PDC',
    name: 'Pont-du-Château',
    region: 'AUV',
    is_active: true,
    address: 'ZI Les Martres, 63430 Pont-du-Château',
    lat: 45.7964,
    lon: 3.2425,
    has_coords: true,
    staff_active_count: 9,
    responsable: { display_name: '—', email: '' },
    equipment: { total: 62, active: 58, hs: 2, linked: true },
  },
]

const MOCK_STAFF_SP = [
  { display_name: 'Sylvain LHOPITAL', role_code: 'lab_manager', employment_level_label: 'Cadre', is_active: true, email: 'slhopital@guintoli.fr' },
  { display_name: 'Marco Costa Pereira', role_code: 'technician', employment_level_label: 'Technicien', is_active: true, email: 'marco.costa@guintoli.fr' },
  { display_name: 'Technicien labo 3', role_code: 'technician', employment_level_label: 'Technicien', is_active: true, email: 'tech3@guintoli.fr' },
  { display_name: 'Stagiaire été', role_code: 'technician', employment_level_label: 'Stagiaire', is_active: false, email: 'stage@guintoli.fr' },
]

const MOCK_DASHBOARD = {
  laboCode: 'SP',
  demandesLabo: [
    { ref: '2026-RA-DEM0042', client: 'Eiffage GC', statut: 'En cours', echeance: '22/06/2026', tone: 'amber' },
    { ref: '2026-RA-DEM0038', client: 'Colas', statut: 'A planifier', echeance: '25/06/2026', tone: 'sky' },
  ],
  demandesPartagees: [
    { ref: '2026-RA-DEM0051', client: 'NGE — essai partagé', statut: 'Demande essais', labo: 'PDC → SP', tone: 'teal' },
  ],
  essaisEnCours: 14,
  echantillonsRecus: 6,
  equipHs: 4,
  planningSemaine: 9,
}

const VIEWS = [
  { id: 'admin', label: 'Administration' },
  { id: 'dashboard', label: 'Dashboard labo' },
  { id: 'scope', label: 'Périmètre & données' },
]

function Badge({ children, tone = 'slate' }) {
  const cls = {
    green: 'bg-[#eaf3de] text-[#3b6d11]',
    amber: 'bg-[#faeeda] text-[#854f0b]',
    sky: 'bg-[#eef6fd] text-[#185fa5]',
    teal: 'bg-[#e8f4f2] text-[#14655d]',
    slate: 'bg-[#f1efe8] text-[#5f5e5a]',
  }[tone] || 'bg-[#f1efe8] text-[#5f5e5a]'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{children}</span>
}

function StatCard({ label, value, hint, icon: Icon }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
          {hint ? <div className="text-[11px] text-text-muted mt-1">{hint}</div> : null}
        </div>
        {Icon ? <Icon className="w-5 h-5 text-nge shrink-0" /> : null}
      </div>
    </div>
  )
}

function AdminListView({ selected, onSelect }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4 min-h-0">
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-[12px] text-text-muted">
          <strong className="text-text">Administration → Laboratoires</strong>
          {' '}— référentiel central (implémenté). Personnel via <code className="text-[11px]">service_code</code>.
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {['Code', 'Nom', 'Équipe', 'Équip.', 'Coords', 'Statut'].map((h) => (
                <th key={h} className="bg-bg px-3 py-2 text-left text-[11px] font-medium text-text-muted border-b border-border">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_LABS.map((lab) => (
              <tr
                key={lab.code}
                onClick={() => onSelect(lab)}
                className={`border-b border-border cursor-pointer transition-colors ${selected?.code === lab.code ? 'bg-[#eeeffe]' : 'hover:bg-bg'}`}
              >
                <td className="px-3 py-2 text-xs font-semibold">{lab.code}</td>
                <td className="px-3 py-2 text-xs">{lab.name}</td>
                <td className="px-3 py-2 text-xs">
                  {lab.staff_active_count} actifs
                  {lab.responsable?.display_name && lab.responsable.display_name !== '—' ? (
                    <div className="text-[10px] text-text-muted">Resp. {lab.responsable.display_name}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs">{lab.equipment.total}</td>
                <td className="px-3 py-2 text-xs font-mono">{lab.has_coords ? `${lab.lat}, ${lab.lon}` : '—'}</td>
                <td className="px-3 py-2"><Badge tone="green">Actif</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Fiche laboratoire {selected?.code || '—'}</div>
            <div className="text-[11px] text-text-muted">Modal XL — état cible validé</div>
          </div>
          <Badge tone="green">Implémenté</Badge>
        </div>
        {selected ? (
          <div className="p-4 flex flex-col gap-3 overflow-y-auto text-xs">
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Équipe active" value={selected.staff_active_count} icon={Users} />
              <StatCard label="Équipements" value={selected.equipment.total} hint={`${selected.equipment.active} en service`} icon={Wrench} />
              <StatCard label="Coords GPS" value={selected.has_coords ? 'OK' : '—'} icon={MapPin} />
            </div>
            <div className="rounded-lg border border-border bg-bg px-3 py-2">
              <div className="font-medium mb-1">Responsable</div>
              <div>{selected.responsable?.display_name || 'Non défini — select dans la fiche'}</div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-bg px-3 py-2 font-medium border-b border-border">Personnel rattaché (read-only)</div>
              {(selected.code === 'SP' ? MOCK_STAFF_SP : []).map((person) => (
                <div key={person.email} className="flex items-center justify-between px-3 py-2 border-b border-border last:border-0">
                  <div>
                    <div className="font-medium">{person.display_name}</div>
                    <div className="text-text-muted">{person.role_code} · {person.employment_level_label}</div>
                  </div>
                  <Badge tone={person.is_active ? 'green' : 'slate'}>{person.is_active ? 'Actif' : 'Inactif'}</Badge>
                </div>
              ))}
              {selected.code !== 'SP' ? (
                <div className="px-3 py-4 text-text-muted text-center">Liste dérivée des utilisateurs avec service_code = {selected.code}</div>
              ) : null}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link to="/admin?tab=labs" className="text-nge hover:underline">→ Admin réel</Link>
              <Link to={`/qualite?tab=equipment&labo=${selected.code}`} className="text-nge hover:underline">→ Qualité filtrée</Link>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-text-muted">Cliquez un laboratoire dans la liste</div>
        )}
      </div>
    </div>
  )
}

function DashboardView() {
  const d = MOCK_DASHBOARD
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[#c7d2fe] bg-[#eeeffe] px-4 py-3 text-[12px] leading-relaxed text-[#1e3a8a]">
        <strong>Vision dashboard</strong> — chaque labo voit <em>ses</em> demandes, essais, équipements et planning,
        plus les <strong>demandes partagées</strong> (ex. essais routés vers un autre labo).
        Route existante : <code>/dashboard/labos/:slug</code> — à connecter au code labo BD.
        <Badge tone="amber">À brancher</Badge>
      </div>

      <div className="flex items-center gap-3">
        <Building2 className="w-6 h-6 text-nge" />
        <div>
          <div className="text-lg font-semibold">Laboratoire {d.laboCode} — Saint-Priest</div>
          <div className="text-xs text-text-muted">Vue responsable · périmètre filtré par labo_code / service_code</div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Essais en cours" value={d.essaisEnCours} icon={FlaskConical} />
        <StatCard label="Échantillons reçus" value={d.echantillonsRecus} hint="7 derniers jours" icon={Shield} />
        <StatCard label="Planning semaine" value={d.planningSemaine} icon={Users} />
        <StatCard label="Équip. HS" value={d.equipHs} hint="Qualité · labo SP" icon={Wrench} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-medium text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-nge" /> Demandes du labo SP
          </div>
          <div className="divide-y divide-border">
            {d.demandesLabo.map((row) => (
              <div key={row.ref} className="px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-[12px] text-nge">{row.ref}</div>
                  <div className="text-xs text-text-muted">{row.client} · éch. {row.echeance}</div>
                </div>
                <Badge tone={row.tone}>{row.statut}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-medium text-sm flex items-center gap-2">
            <Share2 className="w-4 h-4 text-teal-600" /> Partagé / routé vers SP
          </div>
          <div className="divide-y divide-border">
            {d.demandesPartagees.map((row) => (
              <div key={row.ref} className="px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-[12px] text-nge">{row.ref}</div>
                  <div className="text-xs text-text-muted">{row.client} · {row.labo}</div>
                </div>
                <Badge tone={row.tone}>{row.statut}</Badge>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 text-[11px] text-text-muted border-t border-border">
            Règle métier : visible même si le dossier est rattaché à un autre labo d&apos;origine.
          </div>
        </div>
      </div>
    </div>
  )
}

function ScopeView() {
  const rows = useMemo(() => ([
    { entity: 'Utilisateur / personnel', link: 'users.service_code', admin: 'Profil utilisateur', labo: 'Auto (session)', shared: '—' },
    { entity: 'Laboratoire', link: 'laboratoires.code', admin: 'Onglet Laboratoires', labo: 'En-tête dashboard', shared: '—' },
    { entity: 'Responsable labo', link: 'laboratoires.responsable_email', admin: 'Fiche labo', labo: 'Badge dashboard', shared: '—' },
    { entity: 'Équipement', link: 'qualite_equipment.labo_code', admin: 'Compteur fiche', labo: 'Qualité filtrée', shared: '—' },
    { entity: 'Demande préparation', link: 'labo_code (à confirmer)', admin: '—', labo: 'Liste labo', shared: 'Essais partagés' },
    { entity: 'Distance chantier', link: 'laboratoires.lat/lon', admin: 'Coords fiche', labo: 'Affaire / passation', shared: '—' },
  ]), [])

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface border border-border rounded-xl p-4 text-[12px] leading-relaxed">
        <div className="font-semibold text-sm mb-2">Modèle de données — une seule liste de personnes</div>
        <p className="text-text-muted mb-3">
          Pas de table « personnel » séparée : les techniciens et responsables sont les <strong>utilisateurs</strong> existants.
          Le laboratoire est le pivot ; le dashboard filtre par code labo de l&apos;utilisateur connecté.
        </p>
        <pre className="text-[11px] bg-bg border border-border rounded-lg p-3 overflow-x-auto">{`Utilisateur                    Laboratoire
───────────                    ───────────
service_code ───────────────►  code
role_code                      responsable_email ──► users.email
display_name                   address, lat, lon, report_header

Qualité
───────
qualite_equipment.labo_code ──► laboratoires.code`}</pre>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-bg text-text-muted">
              <th className="text-left px-3 py-2">Entité</th>
              <th className="text-left px-3 py-2">Lien</th>
              <th className="text-left px-3 py-2">Admin</th>
              <th className="text-left px-3 py-2">Dashboard labo</th>
              <th className="text-left px-3 py-2">Partagé</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.entity} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{row.entity}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{row.link}</td>
                <td className="px-3 py-2">{row.admin}</td>
                <td className="px-3 py-2">{row.labo}</td>
                <td className="px-3 py-2">{row.shared}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-[#d4e4c1] bg-[#eef5e6] p-4">
          <div className="font-semibold text-[#3b6d11] mb-2">✓ Implémenté</div>
          <ul className="list-disc pl-4 space-y-1 text-[#3b6d11]">
            <li>Table laboratoires étendue (coords, responsable, notes)</li>
            <li>GET/PUT /api/admin/labs + fiche détail</li>
            <li>Modal Administration avec personnel + équipements</li>
            <li>qualite_equipment.labo_code + filtre API/UI</li>
            <li>Helpers userMatchesLab / user_service_matches_lab</li>
          </ul>
        </div>
        <div className="rounded-xl border border-[#ecd1a2] bg-[#fbf1e2] p-4">
          <div className="font-semibold text-[#854f0b] mb-2">○ Prochaine étape</div>
          <ul className="list-disc pl-4 space-y-1 text-[#854f0b]">
            <li>Dashboard : filtrer par service_code utilisateur logado</li>
            <li>Remplacer profiles hardcodés par laboratoires BD</li>
            <li>Règles « demande partagée » explicites en API</li>
            <li>Backfill labo_code sur équipements existants</li>
            <li>15+ labos : CRUD création labo (admin)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function LaboratoiresAdminMockupPage() {
  const [view, setView] = useState('admin')
  const [selectedLab, setSelectedLab] = useState(MOCK_LABS[0])

  return (
    <FichePageShell>
      <DashboardHero
        eyebrow="Mockup v1 · 2026-06-18"
        title="Laboratoires RST — Administration & périmètre dashboard"
        subtitle="Référentiel central des labos, personnel via utilisateurs, équipements par code labo, et vision du dashboard filtré (labo propre + demandes partagées)."
        aside={(
          <div className="flex flex-wrap gap-2">
            <Link to="/admin?tab=labs" className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20">Admin réel</Link>
            <span className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/70">HTML : docs/MOCKUP_LABORATOIRES_ADMIN_20260618.md</span>
          </div>
        )}
      />

      <div className="flex shrink-0 items-center gap-0 border-b border-border bg-surface px-7">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={`h-11 border-b-2 px-4 text-[13px] font-medium transition-colors ${
              view === item.id ? 'border-nge text-nge' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <FicheMain className="min-h-0 flex-1 overflow-y-auto">
        {view === 'admin' && <AdminListView selected={selectedLab} onSelect={setSelectedLab} />}
        {view === 'dashboard' && <DashboardView />}
        {view === 'scope' && <ScopeView />}
      </FicheMain>
    </FichePageShell>
  )
}
