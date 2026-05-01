RaLab5 - Rapport DE package v3

This package separates the shared report structure from the DE-specific body.
The uploaded NGE PDF shows that the header, conclusion/comments block, signature block and bottom document code are reusable across reports.

Files to copy:

1. src/components/rapports/RapportHeader.jsx
   Shared report header component.
   Common to all future reports:
   - NGE logo
   - central title/subtitle/standard
   - report number / chrono / affaire / edition date
   - site / chantier box
   - laboratory line

2. src/components/rapports/RapportConclusionBlock.jsx
   Shared final block.
   Common to all future reports:
   - 4/ CONCLUSIONS
   - control/conformity lines
   - 6/ COMMENTAIRES
   - signature block: Nom / Fonction / Visa

3. src/components/rapports/RapportFooter.jsx
   Shared footer document code.
   Placeholder currently used:
   CODE WBS / CODE DOCUMENT À DÉFINIR
   Later this should be filled using the WBS/document-code logic.

4. src/components/rapports/RapportToolbar.jsx
   Shared toolbar outside the printable A4 sheet.
   Contains action placeholders for print, PDF export, review, validation and mail preparation.

5. src/pages/rapports/RapportDEPage.jsx
   DE-specific report body only:
   - 1/ RENSEIGNEMENTS GENERAUX
   - 2/ CRITERES DE CONFORMITE
   - 3/ RESULTATS DES ESSAIS
   - DE points table and averages

6. src/styles/rapport-nge.css
   Shared NGE-style printable CSS:
   - A4 page
   - Excel-like borders
   - shared header
   - shared final block
   - shared footer
   - DE table styles

Suggested route:

import RapportDEPage from "./pages/rapports/RapportDEPage";

<Route path="/rapports/de/:essaiId" element={<RapportDEPage />} />

Logo:
Place the real logo at:
public/assets/logos/nge-logo.png

If the image is missing or the extension is wrong, the component falls back to a simple NGE text logo.

v4 layout adjustment:
- The printable A4 sheet now uses a flex frame so the report grid occupies the full page height.
- The common footer/document code is placed vertically at the bottom-right edge, rotated clockwise, with the placeholder CODE WBS / CODE DOCUMENT À DÉFINIR.
- The footer is kept outside the shared report frame so the frame remains reusable and fills the printable area.
