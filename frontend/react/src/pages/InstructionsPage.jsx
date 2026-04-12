/**
 * InstructionsPage.jsx
 * Small static help page to compare the preview pages.
 *
 * Preview route proposal:
 * - /instructions-preview
 */

import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'

function Card({ title, children }) {
    return (
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-bg">
                <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

function Bullet({ children }) {
    return (
        <div className="text-[13px] leading-6 text-text-muted">• {children}</div>
    )
}

export default function InstructionsPage() {
    const navigate = useNavigate()

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0 flex-wrap bg-surface">
                <button
                    onClick={() => navigate(-1)}
                    className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors"
                >
                    ← Retour
                </button>
                <span className="text-[14px] font-semibold flex-1 font-mono">Instructions preview pages</span>
            </div>

            <div className="p-5 max-w-[860px] mx-auto w-full flex flex-col gap-4">
                <Card title="Logique métier">
                    <Bullet>Demande = contexte et besoin.</Bullet>
                    <Bullet>Préparation = organiser ce qu’on va faire.</Bullet>
                    <Bullet>Intervention = exécution réelle sur le terrain.</Bullet>
                    <Bullet>Échantillon = ce qui a été prélevé.</Bullet>
                    <Bullet>Essai = analyse détaillée.</Bullet>
                </Card>

                <Card title="Pages preview ajoutées">
                    <Bullet>PreparationPageCard.jsx = version dans la logique visuelle de EchantillonPage.</Bullet>
                    <Bullet>InterventionPageCard.jsx = même logique visuelle, plus orientée fiche labo.</Bullet>
                    <Bullet>Ces pages n’écrasent pas les pages actuelles.</Bullet>
                </Card>

                <Card title="Routes proposées">
                    <div className="text-[13px] leading-7 text-text-muted">
                        /preparations-card/:uid<br />
                        /interventions-card/:uid<br />
                        /interventions-card/new?demande_id=123&source=preparation-card
                    </div>
                </Card>

                <Card title="But du test">
                    <Bullet>Comparer le rendu “type échantillon” avec les pages actuelles.</Bullet>
                    <Bullet>Valider si cette logique de lecture / modification convient mieux.</Bullet>
                    <Bullet>Choisir ensuite quoi garder pour la vraie version finale.</Bullet>
                </Card>
            </div>
        </div>
    )
}
