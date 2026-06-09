// QsseFncPage.jsx
import React, { useMemo, useState } from "react";

const EVENTS = [
    { id: "2026-RA-FNC0001", register: "FNC", date: "12/02/2026", eventDate: "2025", agency: "RL GT", chantier: "RAN63C", title: "Liste FNC T6 - réseaux / voirie", family: "Technique / interfaces", status: "Backlog 2025", cost: 43140, owner: "Conducteur travaux", action: "À requalifier", backlog: true, tone: "amber" },
    { id: "2026-RA-FNC0081", register: "FNC", date: "18/02/2026", eventDate: "18/02/2026", agency: "AUV EHTP", chantier: "RAP22K", title: "Absence de contrôle sur tranchées AEP", family: "Absence de contrôle", status: "Action en cours", cost: 25000, owner: "Responsable travaux", action: "Plan contrôle à formaliser", backlog: false, tone: "red" },
    { id: "2026-RA-FAE0014", register: "FAE", date: "04/03/2026", eventDate: "04/03/2026", agency: "RL TU", chantier: "RAQ18B", title: "Départ de boue vers avaloir après pluie", family: "Environnement / eaux", status: "Mesure immédiate faite", cost: 1200, owner: "QSE chantier", action: "Renforcer protection avaloirs", backlog: false, tone: "green" },
    { id: "2026-RA-BP0007", register: "BP", date: "11/03/2026", eventDate: "11/03/2026", agency: "AUV", chantier: "RAP56C", title: "Pré-check enrobés avant intervention de nuit", family: "Bonne pratique / contrôle", status: "À diffuser", cost: 0, owner: "Labo / travaux", action: "Transformer en support 1/4h qualité", backlog: false, tone: "blue" },
    { id: "2026-RA-RI0023", register: "INFO", date: "22/03/2026", eventDate: "22/03/2026", agency: "AIN", chantier: "RAP99A", title: "Risque récurrent de confusion de plans indice B/C", family: "Remontée d'info / prévention", status: "À analyser", cost: 0, owner: "Méthodes / travaux", action: "Créer alerte prévention documentaire", backlog: false, tone: "slate" },
    { id: "2026-RA-FNC0097", register: "FNC", date: "05/03/2026", eventDate: "05/03/2026", agency: "AIN", chantier: "RAP99A", title: "Fuite réseau incendie", family: "Méthode de travail", status: "Ouverte", cost: 20000, owner: "Chef de secteur", action: "Analyse cause racine", backlog: false, tone: "red" },
    { id: "2026-RA-FAE0021", register: "FAE", date: "08/04/2026", eventDate: "08/04/2026", agency: "LHL", chantier: "RAQ31D", title: "Stockage provisoire matériaux à clarifier", family: "Environnement / stockage", status: "Action en cours", cost: 0, owner: "Chef chantier", action: "Définir zone balisée et photo preuve", backlog: false, tone: "green" },
    { id: "2026-RA-BP0012", register: "BP", date: "15/04/2026", eventDate: "15/04/2026", agency: "RL GT", chantier: "RAQ40F", title: "Planche photo autocontrôle avant remblaiement", family: "Bonne pratique / traçabilité", status: "Validée", cost: 0, owner: "Qualité RA", action: "Diffusion agences", backlog: false, tone: "blue" },
];

const ACTIONS = [
    { title: "Requalifier le stock RAN63C / T6", pilot: "Qualité RA", due: "31/05/2026", status: "En cours", risk: "Haut", register: "FNC", detail: "Distinguer date du fait, date de remontée et date de saisie pour éviter une fausse dérive 2026." },
    { title: "Créer typologie causes RaLab", pilot: "RST / Qualité", due: "15/06/2026", status: "À faire", risk: "Moyen", register: "FNC", detail: "Remplacer le grand sac TECHNIQUE par des familles exploitables en REX." },
    { title: "Formaliser les FAE environnement", pilot: "QSE / Exploitation", due: "20/06/2026", status: "À faire", risk: "Moyen", register: "FAE", detail: "Séparer incident environnement, action environnementale et simple observation terrain." },
    { title: "Transformer les BP en supports diffusables", pilot: "Qualité RA", due: "30/06/2026", status: "À faire", risk: "Faible", register: "BP", detail: "Créer un circuit validation puis diffusion 1/4h qualité, environnement ou sécurité." },
    { title: "Trier les remontées d'infos utiles", pilot: "Méthodes / RST", due: "15/07/2026", status: "À cadrer", risk: "Moyen", register: "INFO", detail: "Permettre à une remontée d'info de devenir FNC, FAE, BP ou action préventive." },
];

const MONTHS = [
    { label: "Jan", all: 27, clean: 21, FAE: 4, BP: 2, INFO: 5 },
    { label: "Fév", all: 87, clean: 19, FAE: 5, BP: 4, INFO: 7 },
    { label: "Mar", all: 29, clean: 26, FAE: 8, BP: 5, INFO: 10 },
    { label: "Avr", all: 13, clean: 11, FAE: 6, BP: 6, INFO: 8 },
];

const CAUSES = [
    { label: "Technique / interfaces", value: 82 },
    { label: "Erreur humaine / rigueur", value: 30 },
    { label: "Environnement / eaux", value: 14 },
    { label: "Communication", value: 8 },
    { label: "Méthode", value: 7 },
];

const REGISTER_CONFIG = {
    ALL: { label: "Tous registres", description: "Vue consolidée QSSE avec FNC, FAE, BP et remontées d'infos." },
    FNC: { label: "Registre FNC", description: "Non-conformités, coûts, causes, traitements et actions correctives." },
    FAE: { label: "Registre FAE", description: "Fiches d'action / événement environnement, mesures immédiates et suivi QSE." },
    BP: { label: "Registre BP", description: "Bonnes pratiques validables, diffusables et transformables en REX." },
    INFO: { label: "Remontées d'infos", description: "Signaux faibles, alertes terrain, idées d'amélioration et prévention." },
};

const REGISTER_LABELS = {
    ALL: "Tous registres",
    FNC: "Registre FNC",
    FAE: "Registre FAE",
    BP: "Registre BP",
    INFO: "Remontées d'infos",
};

function formatMoney(value) {
    return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(value);
}

function getPillClass(tone) {
    const classes = {
        blue: "bg-blue-100 text-blue-900",
        amber: "bg-amber-100 text-amber-900",
        red: "bg-red-100 text-red-900",
        green: "bg-emerald-100 text-emerald-900",
        slate: "bg-slate-100 text-slate-700",
        dark: "bg-slate-900 text-white",
    };

    return classes[tone] || classes.slate;
}

function getCardClass(tone) {
    const classes = {
        blue: "border-blue-100 bg-blue-50 text-blue-950",
        amber: "border-amber-100 bg-amber-50 text-amber-950",
        red: "border-red-100 bg-red-50 text-red-950",
        green: "border-emerald-100 bg-emerald-50 text-emerald-950",
        slate: "border-slate-100 bg-slate-50 text-slate-950",
    };

    return classes[tone] || classes.blue;
}

function getRegisterTone(register) {
    const tones = {
        FNC: "red",
        FAE: "green",
        BP: "blue",
        INFO: "slate",
    };

    return tones[register] || "slate";
}

function Pill({ children, tone = "slate" }) {
    return (
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getPillClass(tone)}`}>
            {children}
        </span>
    );
}

function RegisterBadge({ register }) {
    return <Pill tone={getRegisterTone(register)}>{register}</Pill>;
}

function StatCard({ label, value, sub, tone }) {
    return (
        <div className={`rounded-2xl border p-4 shadow-sm ${getCardClass(tone)}`}>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
            <div className="mt-2 text-3xl font-black tracking-tight">{value}</div>
            <div className="mt-1 text-xs opacity-80">{sub}</div>
        </div>
    );
}

function BarList({ data }) {
    const max = Math.max(...data.map((item) => item.value));

    return (
        <div className="space-y-3">
            {data.map((item) => (
                <div key={item.label}>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                        <span className="font-medium">{item.label}</span>
                        <span>{item.value}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                            className="h-full rounded-full bg-slate-900"
                            style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

function MonthlyBars({ cleanView, registerFilter }) {
    const values = MONTHS.map((item) => {
        if (["FAE", "BP", "INFO"].includes(registerFilter)) {
            return item[registerFilter];
        }

        return cleanView ? item.clean : item.all;
    });
    const max = Math.max(...values);

    return (
        <div className="flex h-44 items-end gap-4 rounded-2xl bg-white p-4">
            {MONTHS.map((item, index) => {
                const value = values[index];

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
                );
            })}
        </div>
    );
}

function DataQualityPanel() {
    const alerts = [
        { tone: "amber", title: "Backlog RAN63C / T6", text: "79 FNC saisies en 2026 mais rattachées à des faits 2025." },
        { tone: "red", title: "Actions correctives manquantes", text: "FNC à verrouiller avant clôture si cause ou action absente." },
        { tone: "green", title: "FAE à distinguer", text: "Séparer incident environnement, action environnementale et simple observation." },
        { tone: "blue", title: "BP à diffuser", text: "Les bonnes pratiques doivent pouvoir devenir REX ou support 1/4h." },
        { tone: "slate", title: "Remontées d'infos à trier", text: "Une info peut devenir FNC, FAE, BP, action ou simple veille." },
    ];

    return (
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-black text-slate-950">Alertes pilotage</h3>
                    <p className="mt-1 text-xs text-slate-500">Points à corriger avant exploitation direction.</p>
                </div>
                <Pill tone="red">12 alertes</Pill>
            </div>

            <div className="mt-4 space-y-3">
                {alerts.map((alert) => (
                    <div key={alert.title} className={`rounded-2xl border p-3 ${getCardClass(alert.tone)}`}>
                        <div className="text-sm font-bold">{alert.title}</div>
                        <p className="mt-1 text-xs opacity-80">{alert.text}</p>
                    </div>
                ))}
            </div>
        </aside>
    );
}

function DashboardView({ cleanView, dateMode, registerFilter }) {
    const stats = useMemo(() => {
        const fncRows = EVENTS.filter((row) => row.register === "FNC");
        const visibleFncRows = cleanView ? fncRows.filter((row) => !row.backlog) : fncRows;
        const faeRows = EVENTS.filter((row) => row.register === "FAE");

        return {
            fnc: visibleFncRows.length,
            fae: faeRows.length,
            bp: EVENTS.filter((row) => row.register === "BP").length,
            info: EVENTS.filter((row) => row.register === "INFO").length,
            cost: visibleFncRows.reduce((sum, row) => sum + row.cost, 0) + faeRows.reduce((sum, row) => sum + row.cost, 0),
        };
    }, [cleanView]);

    const rows = EVENTS.filter((row) => !cleanView || !row.backlog);

    return (
        <div className="grid grid-cols-12 gap-4">
            <section className="col-span-9 space-y-4">
                <div className="grid grid-cols-5 gap-4">
                    <StatCard label="FNC" value={stats.fnc} sub={cleanView ? "Hors backlog" : "Avec backlog"} tone="red" />
                    <StatCard label="FAE" value={stats.fae} sub="Actions / événements env." tone="green" />
                    <StatCard label="BP" value={stats.bp} sub="Bonnes pratiques" tone="blue" />
                    <StatCard label="Infos" value={stats.info} sub="Signaux faibles" tone="slate" />
                    <StatCard label="Coût" value={formatMoney(stats.cost)} sub="FNC + FAE renseignées" tone="amber" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-slate-950">Évolution mensuelle</h3>
                                <p className="text-xs text-slate-500">Lecture actuelle : {dateMode}</p>
                            </div>
                            <Pill tone={cleanView ? "green" : "amber"}>{cleanView ? "Vue nettoyée" : "Vue brute"}</Pill>
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
                        <BarList data={CAUSES} />
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-black text-slate-950">Événements prioritaires</h3>
                            <p className="text-xs text-slate-500">Liste courte pour arbitrage qualité, environnement, travaux et REX.</p>
                        </div>
                        <button className="rounded-xl bg-blue-950 px-4 py-2 text-xs font-bold text-white shadow-sm">Nouvel événement</button>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-3 py-3">Registre</th>
                                    <th className="px-3 py-3">N°</th>
                                    <th className="px-3 py-3">Chantier</th>
                                    <th className="px-3 py-3">Famille</th>
                                    <th className="px-3 py-3">Statut</th>
                                    <th className="px-3 py-3 text-right">Coût</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-3"><RegisterBadge register={row.register} /></td>
                                        <td className="px-3 py-3 font-bold text-slate-900">{row.id}</td>
                                        <td className="px-3 py-3 text-slate-700">{row.chantier}</td>
                                        <td className="px-3 py-3 text-slate-700">{row.family}</td>
                                        <td className="px-3 py-3"><Pill tone={row.tone}>{row.status}</Pill></td>
                                        <td className="px-3 py-3 text-right font-semibold text-slate-900">{row.cost ? formatMoney(row.cost) : "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section className="col-span-3">
                <DataQualityPanel />
            </section>
        </div>
    );
}

function RegisterView({ cleanView, registerFilter }) {
    const rows = EVENTS.filter((row) => {
        if (cleanView && row.backlog) {
            return false;
        }

        return registerFilter === "ALL" || row.register === registerFilter;
    });
    const config = REGISTER_CONFIG[registerFilter];

    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-black text-slate-950">{config.label}</h3>
                    <p className="text-sm text-slate-500">{config.description}</p>
                </div>
                <div className="flex gap-2">
                    <button className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Importer Excel</button>
                    <button className="rounded-xl bg-blue-950 px-3 py-2 text-xs font-bold text-white">Créer</button>
                </div>
            </div>

            <div className="mb-4 grid grid-cols-7 gap-2">
                {["Année", "Registre", "Agence", "Chantier", "Famille", "Statut", "Backlog"].map((label) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Filtre</div>
                        <div className="text-sm font-semibold text-slate-700">{label}</div>
                    </div>
                ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full text-left text-sm">
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
                            <th className="px-3 py-3 text-right">Coût</th>
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
                                <td className="px-3 py-3 text-right font-bold text-slate-900">{row.cost ? formatMoney(row.cost) : "-"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Field({ label, value, wide = false }) {
    return (
        <div className={wide ? "col-span-2" : ""}>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">{value}</div>
        </div>
    );
}

function EventFicheView() {
    return (
        <div className="grid grid-cols-12 gap-4">
            <section className="col-span-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-blue-900">Fiche événement QSSE</div>
                        <h3 className="mt-1 text-2xl font-black text-slate-950">2026-RA-FNC0001</h3>
                        <p className="mt-1 text-sm text-slate-500">RAN63C / Liste FNC T6 - régularisation de faits 2025</p>
                    </div>
                    <div className="flex gap-2">
                        <RegisterBadge register="FNC" />
                        <Pill tone="amber">Backlog 2025</Pill>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Field label="Registre" value="FNC" />
                    <Field label="Type RaLab" value="Non-conformité qualité" />
                    <Field label="Date du fait" value="2025 à confirmer" />
                    <Field label="Date de remontée" value="Février 2026" />
                    <Field label="Date de saisie" value="12/02/2026" />
                    <Field label="Date de clôture" value="Non clôturée" />
                    <Field label="Agence" value="RL GT" />
                    <Field label="Chantier" value="RAN63C" />
                    <Field label="Famille RaLab" value="Technique / interfaces chantier" />
                    <Field label="Criticité" value="Majeure" />
                    <Field label="Constat" value="Dégradations et reprises multiples identifiées dans la liste FNC T6. Les faits sont rattachés à 2025 mais remontés tardivement." wide />
                    <Field label="Cause identifiée" value="Remontée tardive, qualification technique à reprendre, chantier T6 à consolider." wide />
                    <Field label="Traitement immédiat" value="Rattacher au bon exercice opérationnel et vérifier les doublons avec le registre 2025." wide />
                    <Field label="Action corrective" value="Nettoyer la codification RAN63C/T6 et imposer date du fait + date de remontée dans RaLab." wide />
                </div>
            </section>

            <aside className="col-span-4 space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h4 className="text-sm font-black text-slate-950">Conversion possible</h4>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-950">FNC</button>
                        <button className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-950">FAE</button>
                        <button className="rounded-2xl bg-blue-50 p-3 text-sm font-bold text-blue-950">BP</button>
                        <button className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700">Info</button>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">Une remontée d'info peut être qualifiée ensuite comme FNC, FAE, bonne pratique ou simple veille.</p>
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
                    <h4 className="text-sm font-black text-slate-950">Checklist clôture</h4>
                    <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-emerald-950"><span>Constat renseigné</span><span>OK</span></div>
                        <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-amber-950"><span>Date du fait</span><span>À confirmer</span></div>
                        <div className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-red-950"><span>Action corrective</span><span>À compléter</span></div>
                        <div className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-red-950"><span>Coût validé</span><span>Non</span></div>
                    </div>
                </div>
            </aside>
        </div>
    );
}

function ActionsView() {
    return (
        <div className="grid grid-cols-3 gap-4">
            {ACTIONS.map((action) => (
                <div key={action.title} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-black text-slate-950">{action.title}</h3>
                        <RegisterBadge register={action.register} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{action.detail}</p>
                    <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                        <div><span className="font-bold">Pilote : </span>{action.pilot}</div>
                        <div><span className="font-bold">Échéance : </span>{action.due}</div>
                        <div><span className="font-bold">Statut : </span>{action.status}</div>
                        <div><span className="font-bold">Risque : </span>{action.risk}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function RexView() {
    return (
        <div className="grid grid-cols-12 gap-4">
            <section className="col-span-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                    <div className="text-xs font-bold uppercase tracking-widest text-blue-900">REX automatique</div>
                    <h3 className="mt-1 text-2xl font-black text-slate-950">Du signal faible à la bonne pratique</h3>
                    <p className="mt-1 text-sm text-slate-500">Fiche générée à partir des FNC, FAE, BP et remontées d'infos.</p>
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="text-sm font-black text-slate-950">Constat</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-600">Les registres ne doivent pas rester séparés. Une information terrain peut annoncer une future FNC, une FAE peut produire une action préventive, et une BP peut devenir un standard régional.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="text-sm font-black text-slate-950">Enseignement</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-600">Le suivi QSSE doit mesurer les écarts, mais aussi les apprentissages. Sinon on collectionne les problèmes et on oublie les antidotes.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="text-sm font-black text-slate-950">Action préventive</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-600">Créer un workflow unique : remontée d'info → qualification → FNC, FAE, BP ou action → validation → diffusion REX.</p>
                    </div>
                </div>
            </section>

            <aside className="col-span-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-black text-slate-950">Formats export possibles</h3>
                <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-950"><div className="font-black">Fiche REX PDF</div><p className="mt-1">Une page synthétique pour direction, qualité, environnement et travaux.</p></div>
                    <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950"><div className="font-black">Support 1/4h environnement</div><p className="mt-1">Version courte issue des FAE ou incidents environnement.</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"><div className="font-black">Support 1/4h qualité</div><p className="mt-1">Version courte issue des FNC, BP ou remontées d'infos.</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"><div className="font-black">Plan d'actions</div><p className="mt-1">Actions curatives, correctives, préventives et diffusion.</p></div>
                </div>
            </aside>
        </div>
    );
}

function WorkflowView() {
    const steps = [
        { title: "Remontée d'info", text: "Signal faible, remarque terrain, suggestion ou alerte." },
        { title: "Qualification", text: "Choix du registre : FNC, FAE, BP ou veille simple." },
        { title: "Traitement", text: "Mesure immédiate, analyse cause, action et pilote." },
        { title: "Validation", text: "Clôture contrôlée, preuve et coût si nécessaire." },
        { title: "REX", text: "Capitalisation, diffusion et support 1/4h." },
    ];

    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5">
                <div className="text-xs font-bold uppercase tracking-widest text-blue-900">Workflow QSSE</div>
                <h3 className="mt-1 text-2xl font-black text-slate-950">Un seul flux, plusieurs registres</h3>
                <p className="mt-1 text-sm text-slate-500">Le registre n'est pas choisi trop tôt. RaLab laisse d'abord remonter l'information, puis la qualifie.</p>
            </div>

            <div className="grid grid-cols-5 gap-4">
                {steps.map((step, index) => (
                    <div key={step.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-950 text-sm font-black text-white">{index + 1}</div>
                        <h4 className="text-sm font-black text-slate-950">{step.title}</h4>
                        <p className="mt-2 text-xs leading-5 text-slate-600">{step.text}</p>
                    </div>
                ))}
            </div>

            <div className="mt-5 rounded-3xl bg-blue-950 p-4 text-white">
                <div className="text-sm font-black">Règle RaLab proposée</div>
                <p className="mt-2 text-sm leading-6 text-blue-100">Toute remontée peut rester une information, ou être convertie en FNC, FAE, BP ou action préventive. La conversion garde l'historique complet pour éviter les pertes de traçabilité.</p>
            </div>
        </div>
    );
}

export default function QsseFncPage() {
    const [activeTab, setActiveTab] = useState("dashboard");
    const [cleanView, setCleanView] = useState(false);
    const [dateMode, setDateMode] = useState("date de saisie");
    const [registerFilter, setRegisterFilter] = useState("ALL");

    const tabs = [
        { key: "dashboard", label: "Dashboard" },
        { key: "register", label: "Registres" },
        { key: "fiche", label: "Fiche" },
        { key: "actions", label: "Plan d'actions" },
        { key: "rex", label: "REX" },
        { key: "workflow", label: "Workflow" },
    ];

    return (
        <div className="min-h-screen bg-slate-100 p-6 font-sans text-slate-900">
            <div className="mx-auto max-w-7xl">
                <header className="mb-5 rounded-3xl bg-blue-950 p-5 text-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200">RaLab</div>
                            <h1 className="mt-1 text-3xl font-black tracking-tight">QSSE / FNC / FAE / BP / Infos</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">Module de pilotage pour gérer les non-conformités, actions ou événements environnement, bonnes pratiques, remontées d'infos, imports historiques et REX.</p>
                        </div>
                        <div className="rounded-2xl bg-white/10 p-3 text-right backdrop-blur">
                            <div className="text-xs uppercase tracking-wide text-blue-100">Vue actuelle</div>
                            <div className="text-lg font-black">{cleanView ? "Hors backlog" : "Registre complet"}</div>
                        </div>
                    </div>
                </header>

                <div className="mb-5 grid grid-cols-12 gap-4">
                    <nav className="col-span-6 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
                        <div className="flex flex-wrap gap-2">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${activeTab === tab.key ? "bg-blue-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </nav>

                    <div className="col-span-6 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="grid grid-cols-3 gap-2">
                            <select
                                value={registerFilter}
                                onChange={(event) => setRegisterFilter(event.target.value)}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                            >
                                {Object.entries(REGISTER_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                            <select
                                value={dateMode}
                                onChange={(event) => setDateMode(event.target.value)}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                            >
                                <option>date de saisie</option>
                                <option>date du fait</option>
                                <option>date de remontée</option>
                                <option>date de clôture</option>
                            </select>
                            <button
                                onClick={() => setCleanView((value) => !value)}
                                className={`rounded-2xl px-3 py-2 text-sm font-bold transition ${cleanView ? "bg-emerald-100 text-emerald-950" : "bg-amber-100 text-amber-950"}`}
                            >
                                {cleanView ? "Backlog exclu" : "Inclure backlog"}
                            </button>
                        </div>
                    </div>
                </div>

                {activeTab === "dashboard" && <DashboardView cleanView={cleanView} dateMode={dateMode} registerFilter={registerFilter} />}
                {activeTab === "register" && <RegisterView cleanView={cleanView} registerFilter={registerFilter} />}
                {activeTab === "fiche" && <EventFicheView />}
                {activeTab === "actions" && <ActionsView />}
                {activeTab === "rex" && <RexView />}
                {activeTab === "workflow" && <WorkflowView />}
            </div>
        </div>
    );
}
