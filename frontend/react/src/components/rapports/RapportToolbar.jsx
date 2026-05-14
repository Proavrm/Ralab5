import { useNavigate } from "react-router-dom";

export default function RapportToolbar({ reportReference = "" }) {
    const navigate = useNavigate();

    function handlePrint() {
        window.print();
    }

    function handleValidate() {
        const ref = String(reportReference || "").trim();
        if (ref) {
            navigate(`/rapports/validation?report=${encodeURIComponent(ref)}`);
            return;
        }
        if (window.confirm("Aller à la page de validation sans rapport pré-sélectionné ?")) {
            navigate("/rapports/validation");
        }
    }

    return (
        <div className="rapport-toolbar no-print">
            <button type="button" onClick={handlePrint}>Imprimer</button>
            <button type="button" disabled title="Bientôt disponible">Exporter PDF</button>
            <button type="button" disabled title="Bientôt disponible">Envoyer en relecture</button>
            <button type="button" onClick={handleValidate}>Valider</button>
            <button type="button" disabled title="Bientôt disponible">Préparer mail</button>
        </div>
    );
}
