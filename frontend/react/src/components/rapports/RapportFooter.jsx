// RapportFooter.jsx
import React from "react";

export default function RapportFooter({ documentCode = "CODE WBS / CODE DOCUMENT À DÉFINIR" }) {
    return (
        <footer className="rapport-document-footer">
            {documentCode || "CODE WBS / CODE DOCUMENT À DÉFINIR"}
        </footer>
    );
}
