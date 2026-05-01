// RapportConclusionBlock.jsx
import React from "react";

function valueOrEmpty(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return value;
}

export default function RapportConclusionBlock({
    controlLabel = "Contrôle",
    conformityLabel = "Conforme",
    name = "",
    functionName = "",
    comments = "",
}) {
    return (
        <section className="rapport-final-block">
            <div className="rapport-conclusion-comments">
                <div className="rapport-conclusion-block">
                    <h2>4/ <span>CONCLUSIONS</span></h2>
                    <div className="rapport-conclusion-lines">
                        <strong>{valueOrEmpty(controlLabel)}</strong>
                        <strong>{valueOrEmpty(conformityLabel)}</strong>
                    </div>
                </div>

                <div className="rapport-comments-block">
                    <h2>6/ <span>COMMENTAIRES</span></h2>
                    <div>{valueOrEmpty(comments)}</div>
                </div>
            </div>

            <div className="rapport-signature-block">
                <div className="rapport-signature-row">
                    <span>Nom</span>
                    <strong>{valueOrEmpty(name)}</strong>
                </div>
                <div className="rapport-signature-row">
                    <span>Fonction</span>
                    <strong>{valueOrEmpty(functionName)}</strong>
                </div>
                <div className="rapport-signature-row rapport-signature-visa">
                    <span>Visa</span>
                    <strong></strong>
                </div>
            </div>
        </section>
    );
}
