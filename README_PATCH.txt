Patch navigation / UX état demande

Contenu:
- frontend/react/src/pages/DemandePage.jsx
- frontend/react/src/pages/EssaiPage.jsx
- frontend/react/src/pages/EchantillonPage.jsx

Ce patch fait:
1. DemandePage
   - clique sur un node Échantillon ouvre la fiche, même quand il a des enfants
   - dropdowns repliés par défaut pour éviter d'arriver directement au niveau échantillon
   - dégradé léger de couleurs par niveau (prélevement / échantillon / essai)
   - mémorisation sessionStorage:
     - campagnes ouvertes
     - interventions ouvertes
     - objets liés ouverts
     - position de scroll
2. EssaiPage
   - bouton retour respecte return_to
   - bouton / lien vers l'échantillon parent
3. EchantillonPage
   - ouverture d'un essai avec return_to pour revenir proprement

Installation:
- extraire ce zip à la racine du projet RaLab5
- accepter le remplacement des fichiers
- redémarrer le front
