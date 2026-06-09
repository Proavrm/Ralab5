# RaLab5 — Spécification d’implémentation
## Passations, organisation des responsabilités et préparation du démarrage chantier

## 0. Instruction générale au développeur / GitHub Copilot

Implémenter cette évolution dans RaLab5 en respectant l’architecture, les conventions, les composants UI, les repositories, les schémas de validation et les modèles déjà présents dans le projet.

Avant de créer une nouvelle table, un endpoint, un composant ou un fichier :

1. rechercher l’équivalent existant dans le frontend et le backend ;
2. réutiliser les structures existantes de collaborateurs, contacts, affaires RST, demandes, campagnes, interventions, actions et documents ;
3. ne pas inventer de chemin de fichier ;
4. ne pas créer une deuxième logique parallèle si une logique voisine existe déjà ;
5. préserver les données existantes et prévoir une migration compatible ;
6. conserver les commentaires de code en anglais et le nom du fichier en commentaire au début de chaque fichier modifié, selon les conventions du projet ;
7. fournir les fichiers complets modifiés, sans supprimer les fonctions déjà opérationnelles.

La présente spécification décrit la logique fonctionnelle attendue. Les noms de tables et endpoints proposés peuvent être adaptés aux conventions réelles du projet, mais la logique métier ne doit pas être réduite.

---

# 1. Contexte actuel

Le fichier actuel `PassationPage.jsx` est une page React utilisant notamment :

- React Router ;
- React Query ;
- `api` et `affairesApi` ;
- `FichePageShell`, `MetricCard` et `SectionCard` ;
- un objet `EMPTY` pour le formulaire principal ;
- deux collections imbriquées : `documents` et `actions` ;
- `POST /passations` pour la création ;
- `PUT /passations/:uid` pour la modification ;
- `GET /passations/:uid` pour le chargement ;
- `GET /passations/filters` pour les listes de valeurs ;
- un rattachement obligatoire à une `affaire_rst_id` dans le fonctionnement actuel.

La page possède actuellement sept sections :

- A — Identité ;
- B — Contexte & origine ;
- C — Documents reçus / attendus ;
- D — Points de vigilance / contraintes ;
- E — Besoins RST ;
- F — Actions à lancer ;
- G — Synthèse & notes.

Le problème principal est que le champ actuel `Responsable / pilote` mélange plusieurs responsabilités différentes. Les champs libres ne permettent pas de savoir formellement :

- qui a participé à la passation ;
- ce qui a réellement été demandé ;
- ce que le RST a accepté ;
- ce qui reste sous la responsabilité du chantier ou du RCE ;
- qui prépare le plan de contrôle ;
- qui valide ce plan ;
- qui organise la visite initiale ;
- qui prépare les interventions ;
- qui affecte les techniciens ;
- qui exécute réellement les interventions ;
- qui coordonne le laboratoire ;
- qui gère les essais externes ;
- qui prépare et valide la restitution.

Cette ambiguïté doit être supprimée.

---

# 2. Principe d’architecture à respecter

La passation ne doit pas devenir l’objet parent central du workflow.

Le modèle métier reste :

```text
AFFAIRE RST
    ├── DEMANDE(S)
    │       ├── CAMPAGNE(S)
    │       ├── INTERVENTION(S)
    │       ├── ESSAI(S)
    │       └── RAPPORT(S)
    ├── PLAN(S) DE CONTRÔLE
    └── PASSATION(S) éventuelle(s)
```

La passation est un outil facultatif de cadrage, de qualification et de préparation. Elle permet :

- de collecter les informations initiales ;
- de tracer la réunion de passation ;
- de définir le périmètre accepté ;
- d’identifier les responsables ;
- de préparer le démarrage ;
- d’identifier les demandes à créer.

Une demande doit rester directement rattachée à l’affaire RST. Elle peut posséder un lien facultatif vers la passation d’origine pour la traçabilité, mais elle ne doit pas dépendre de la passation pour exister.

Ne pas créer un workflow rigide :

```text
Passation -> Affaire -> Demande
```

La bonne logique est :

```text
Affaire RST -> Demande
       \-> Passation facultative servant de source et de cadrage
```

Conséquences :

- une affaire peut exister sans passation ;
- une demande peut exister sans passation ;
- une passation peut enrichir une affaire existante ;
- une passation peut préparer plusieurs demandes ;
- l’archivage d’une passation ne doit jamais supprimer les demandes, campagnes, interventions ou rapports déjà créés ;
- toute relation de demande à passation doit être facultative et uniquement destinée à la traçabilité.

---

# 3. Objectif fonctionnel

À l’issue d’une passation, le RaLab doit permettre de savoir clairement :

1. qui était présent ;
2. quelle était la demande initiale ;
3. quel périmètre a été accepté par le RST ;
4. quelles prestations sont exclues ou restent à la charge du chantier ;
5. quelle affaire RST est concernée ;
6. qui est responsable de chaque fonction ;
7. qui prépare le plan de contrôle selon le CCTP ;
8. qui valide le plan de contrôle ;
9. si une visite initiale de chantier est nécessaire ;
10. qui organise et réalise cette visite ;
11. qui prépare les futures interventions ;
12. qui affectera les techniciens ;
13. quels documents manquent ;
14. quelles demandes doivent être créées ;
15. quels blocages empêchent le démarrage.

La passation est considérée comme traitée lorsque le cadrage a été transféré vers l’organisation opérationnelle. Cela ne signifie pas que les essais ou la mission sont terminés.

---

# 4. Nouvelle structure de la page

Réorganiser la page en neuf sections.

## A — Identité

Conserver :

- affaire liée ;
- date de passation ;
- numéro d’étude ;
- numéro d’affaire NGE ;
- chantier ;
- client ;
- entreprise responsable ;
- agence.

Remplacer visuellement le champ générique `Responsable / pilote` par des rôles structurés dans la section D.

Pour compatibilité avec les données existantes :

- ne pas supprimer immédiatement le champ backend `responsable` ;
- le conserver pendant la migration ;
- l’utiliser comme donnée historique ;
- si possible, migrer sa valeur vers un rôle approprié seulement lorsque le mapping est certain ;
- ne jamais supposer automatiquement qu’il s’agit du référent RST, du RCE ou du préparateur des interventions.

## B — Contexte & origine

Conserver :

- origine de la passation ;
- type d’opération ;
- phase chantier ;
- description générale ;
- contexte marché.

Le champ libre `Interlocuteurs principaux` doit rester lisible pour l’historique, mais les personnes réellement participantes doivent être structurées dans la section C.

Ajouter :

- objet précis de la demande ;
- résultat attendu ;
- niveau d’urgence ;
- date souhaitée de démarrage ;
- date limite de restitution ;
- motif de l’échéance ;
- demande ferme / prévisionnelle / à confirmer ;
- besoin ponctuel / récurrent.

## C — Participants et périmètre de la passation

Créer deux blocs.

### C1. Participants à la passation

Afficher une table éditable avec les colonnes :

- personne ;
- fonction ;
- entité / service ;
- rôle pendant la passation ;
- présent / absent / représenté ;
- représente ;
- décisionnaire oui/non ;
- commentaire ;
- suppression de la ligne.

Prévoir les rôles de réunion suivants :

- Demandeur initial ;
- Représentant chantier ;
- RCE ;
- Conducteur de travaux ;
- Chef de chantier ;
- Représentant RST ;
- Représentant laboratoire ;
- Représentant études ;
- Représentant client / MOE ;
- Consulté ;
- Informé ;
- Autre.

Ajouter les champs spécifiques :

- référent RST présent à la passation ;
- compte rendu rédigé par ;
- compte rendu validé par ;
- date de diffusion du compte rendu.

La sélection d’une personne interne doit utiliser le référentiel existant des collaborateurs/utilisateurs si celui-ci existe. Pour une personne externe, autoriser une saisie libre avec nom, fonction et entité.

Ne pas stocker uniquement un texte concaténé si un identifiant de personne est disponible. Conserver néanmoins un libellé snapshot pour que l’historique reste lisible si la personne change de fonction.

### C2. Périmètre demandé et accepté

Ajouter les champs :

- demande initiale ;
- périmètre demandé ;
- périmètre accepté par le RST ;
- prestations exclues ;
- prestations restant sous responsabilité chantier ;
- réserves ;
- décision prise pendant la passation ;
- décision validée par ;
- date de décision.

Ces champs sont essentiels et doivent être visibles avant la répartition des responsabilités.

L’interface doit rendre clairement distincts :

- ce que le chantier a demandé ;
- ce que le RST accepte de prendre en charge ;
- ce qui n’est pas pris en charge ;
- ce qui reste au RCE ou à l’exploitation.

## D — Organisation et responsabilités

Créer une table principale `Répartition des rôles`.

Colonnes :

- rôle ;
- personne désignée ;
- service / entité ;
- statut d’affectation ;
- périmètre ;
- source de l’affectation ;
- date de confirmation ;
- commentaire ;
- action de remplacement / suppression selon les droits.

### Rôles minimaux à gérer

#### Organisation chantier

- `CHANTIER_RCE` — Responsable opérationnel chantier / RCE ;
- `CHANTIER_CONDUCTEUR_TRAVAUX` — Conducteur de travaux ;
- `CHANTIER_CHEF_CHANTIER` — Chef de chantier ;
- `CHANTIER_CONTACT_OPERATIONNEL` — Contact opérationnel ;
- `DEMANDEUR_INITIAL` — Demandeur initial.

#### Organisation RST

- `RST_REFERENT_AFFAIRE` — Référent RST de l’affaire ;
- `PASSATION_QUALIFIER` — Responsable de qualification de la passation ;
- `CONTROL_PLAN_AUTHOR` — Responsable de rédaction du plan de contrôle ;
- `CONTROL_PLAN_VALIDATOR` — Validateur du plan de contrôle ;
- `INITIAL_VISIT_OWNER` — Responsable de l’organisation de la visite initiale ;
- `INITIAL_VISIT_RST_PARTICIPANT` — Participant RST prévu pour la visite ;
- `INTERVENTION_PLANNER` — Préparateur des interventions ;
- `TECHNICIAN_ASSIGNER` — Responsable de l’affectation des techniciens ;
- `FIELD_COORDINATOR` — Coordinateur terrain ;
- `LAB_COORDINATOR` — Coordinateur laboratoire ;
- `EXTERNAL_TESTS_OWNER` — Responsable des essais externes ;
- `RESULTS_COORDINATOR` — Responsable de la restitution ;
- `REPORT_VALIDATOR` — Validateur des rapports.

### Statuts d’affectation

Gérer au minimum :

- Proposé ;
- À confirmer ;
- Confirmé ;
- Refusé ;
- À réaffecter ;
- Remplacé ;
- Terminé ;
- Non applicable.

### Source de l’affectation

Gérer au minimum :

- Règle automatique agence ;
- Hérité de l’affaire ;
- Décidé en passation ;
- Saisie manuelle ;
- Défini dans une demande ;
- Migration historique.

### Règle importante

Une personne proposée automatiquement ne doit jamais être considérée comme confirmée sans action explicite de l’utilisateur.

L’interface doit afficher un badge du type :

```text
Proposé automatiquement selon l’agence — à confirmer
```

### Exemple Auvergne

Pour une affaire de l’agence / secteur Auvergne :

- le système doit proposer Christelle comme `CONTROL_PLAN_AUTHOR` ;
- cette règle ne doit pas être codée en dur dans `PassationPage.jsx` ;
- elle doit venir d’une configuration métier ou d’une table de règles ;
- la personne doit être référencée par son identifiant interne lorsque disponible ;
- la proposition doit rester modifiable et confirmer manuellement.

### Différence obligatoire entre rôles

Le système doit distinguer :

- le référent RST de l’affaire ;
- la personne qui prépare le plan de contrôle ;
- la personne qui prépare les interventions ;
- la personne qui affecte les techniciens ;
- les techniciens qui exécutent réellement.

Les techniciens exécutants ne doivent pas être choisis définitivement dans la passation, sauf information déjà certaine. Leur affectation définitive doit être enregistrée dans la campagne ou l’intervention existante.

La passation enregistre seulement le rôle `TECHNICIAN_ASSIGNER`, c’est-à-dire la personne responsable de choisir les techniciens plus tard.

## E — Documents, CCTP et exigences contractuelles

Faire évoluer la table actuelle des documents.

Colonnes recommandées :

- document ;
- obligatoire oui/non ;
- statut documentaire ;
- version ;
- date du document ;
- demandé le ;
- demandé à ;
- date attendue ;
- lien ou pièce jointe ;
- validé oui/non ;
- validé par ;
- commentaire.

Statuts documentaires :

- Non demandé ;
- Demandé ;
- Reçu ;
- À vérifier ;
- Incomplet ;
- Obsolète ;
- Validé ;
- Remplacé ;
- Non applicable.

Ajouter un bloc CCTP :

- CCTP reçu : oui / non / partiel ;
- version du CCTP ;
- date du CCTP ;
- analyse du CCTP nécessaire : oui/non ;
- statut de l’analyse ;
- analyse réalisée par ;
- date d’analyse ;
- exigences particulières ;
- normes identifiées ;
- critères d’acceptation identifiés ;
- fréquences de contrôle identifiées ;
- points d’arrêt identifiés ;
- contrôles contradictoires identifiés ;
- documents complémentaires manquants.

L’analyse détaillée du CCTP et les lignes du plan de contrôle doivent appartenir au module de plan de contrôle, pas être stockées sous forme d’un énorme texte libre dans la passation.

## F — Préparation du démarrage chantier

Créer deux sous-blocs : plan de contrôle et visite initiale.

### F1. Plan de contrôle

Champs :

- plan de contrôle exigé au marché : oui / non / à confirmer ;
- plan de contrôle existant : oui/non ;
- traitement du plan existant : reprendre / compléter / remplacer / non applicable ;
- plan prévisionnel à établir : oui/non ;
- statut du plan ;
- date prévue de rédaction ;
- date prévue de validation ;
- lien vers le plan de contrôle ;
- révision après visite initiale nécessaire : oui/non ;
- commentaire.

Statuts du plan :

- À préparer ;
- En analyse CCTP ;
- Brouillon ;
- À compléter ;
- À adapter après visite ;
- À valider ;
- Validé ;
- Diffusé ;
- En application ;
- À réviser ;
- Révisé ;
- Clôturé ;
- Non applicable.

Le responsable de rédaction et le validateur ne doivent pas être stockés en double dans ce bloc. Ils doivent être obtenus à partir des rôles `CONTROL_PLAN_AUTHOR` et `CONTROL_PLAN_VALIDATOR`.

Si le module de plan de contrôle n’existe pas encore, créer au minimum une entité plan de contrôle avec un lien vers l’affaire et la passation d’origine. Prévoir une page dédiée, sans surcharger la passation avec toutes les lignes de contrôle.

Structure fonctionnelle minimale du plan :

- phase ;
- ouvrage / matériau ;
- contrôle / essai ;
- référence CCTP ;
- norme ;
- fréquence ;
- quantité prévisionnelle ;
- localisation ;
- responsable ;
- critère d’acceptation ;
- enregistrement / livrable attendu ;
- contrôle interne / externe ;
- demande RaLab associée ;
- campagne associée ;
- résultat ;
- conformité ;
- FNC éventuelle ;
- commentaire.

### F2. Visite initiale de chantier

Champs :

- visite nécessaire : oui / non / à confirmer ;
- motif de la visite ;
- moment souhaité : avant démarrage / au démarrage / après démarrage ;
- date prévisionnelle ;
- date confirmée ;
- date réelle ;
- contact sur place ;
- point de rendez-vous ;
- accès chantier ;
- accueil sécurité nécessaire ;
- EPI spécifiques ;
- documents nécessaires ;
- compte rendu obligatoire : oui/non ;
- statut de la visite ;
- lien vers le compte rendu ;
- commentaire.

Statuts :

- À décider ;
- À organiser ;
- Planifiée ;
- Confirmée ;
- Réalisée ;
- Compte rendu à rédiger ;
- Compte rendu transmis ;
- Actions à traiter ;
- Clôturée ;
- Annulée ;
- Non applicable.

Le responsable de l’organisation doit venir du rôle `INITIAL_VISIT_OWNER`.

Le participant RST prévu doit venir du rôle `INITIAL_VISIT_RST_PARTICIPANT`.

La visite doit permettre de confirmer :

- accès et circulation ;
- zones d’essai et de prélèvement ;
- phasage réel ;
- localisation des contrôles ;
- sécurité et coactivité ;
- balisage ;
- moyens fournis par le chantier ;
- stockage et transport des échantillons ;
- disponibilité eau / énergie ;
- cohérence plans / terrain ;
- fréquences de contrôle ;
- circuit de communication des résultats ;
- points d’arrêt ;
- adaptations du plan de contrôle ;
- adaptations des demandes et interventions.

## G — Besoins RST

Conserver les besoins existants :

- laboratoire ;
- terrain ;
- étude ;
- G3 ;
- essais externes ;
- équipements spécifiques ;
- ressources humaines.

Faire évoluer progressivement ces zones libres vers des besoins structurés, sans supprimer immédiatement les champs existants.

Prévoir une table de prestations demandées avec :

- domaine ;
- prestation ;
- quantité estimée ;
- unité ;
- localisation ;
- fréquence ;
- date souhaitée ;
- norme ;
- critère ;
- livrable attendu ;
- interne / externe ;
- commentaire ;
- sélection pour création d’une demande.

Cette table servira à préparer les demandes, mais ne doit pas créer automatiquement une demande à chaque ligne. L’utilisateur doit pouvoir regrouper plusieurs lignes cohérentes dans une même demande.

## H — Actions à lancer

Conserver la table actuelle mais remplacer progressivement le champ texte libre `responsable` par une sélection de personne/contact, avec fallback texte pour les externes.

Ajouter :

- type d’action ;
- lien vers l’objet concerné ;
- origine automatique ou manuelle ;
- date de création ;
- date de réalisation ;
- preuve / pièce jointe éventuelle.

Actions automatiques possibles :

- analyser les exigences du CCTP ;
- préparer le plan de contrôle prévisionnel ;
- faire valider le plan ;
- organiser la visite initiale ;
- réaliser la visite initiale ;
- rédiger le compte rendu ;
- adapter le plan après visite ;
- préparer les demandes ;
- préparer les interventions ;
- affecter les techniciens ;
- réserver le matériel ;
- consulter un laboratoire externe ;
- obtenir une validation financière ;
- demander un document manquant.

La génération d’actions doit être idempotente : relancer la génération ne doit pas créer des doublons.

## I — Synthèse, décision et traitement

Conserver :

- synthèse ;
- notes complémentaires.

Ajouter :

- statut de workflow ;
- décision RST ;
- motif de décision ;
- réserves ;
- informations manquantes ;
- qualifié par ;
- date de qualification ;
- traité par ;
- date de traitement.

Séparer le statut de workflow de la décision métier.

### Statut de workflow

- Brouillon ;
- À qualifier ;
- Informations manquantes ;
- Qualifiée ;
- Traitée ;
- Annulée ;
- Archivée.

### Décision métier

- Non décidée ;
- Acceptée ;
- Acceptée sous réserves ;
- Partiellement acceptée ;
- Hors périmètre RST ;
- Refusée.

Une passation `Traitée` signifie :

- affaire correctement rattachée ;
- périmètre accepté formalisé ;
- responsabilités nécessaires confirmées ;
- documents manquants identifiés ;
- plan de contrôle cadré si nécessaire ;
- visite initiale cadrée si nécessaire ;
- demandes nécessaires identifiées ou créées.

Cela ne signifie pas que les prestations sont terminées.

---

# 5. Où choisir chaque personne

La règle UX doit être explicite.

| Information | Où la saisir | Portée |
|---|---|---|
| Personne présente à la passation | Section C — Participants | Réunion uniquement |
| Demandeur initial | Section C et rôle `DEMANDEUR_INITIAL` | Affaire / origine du besoin |
| RCE / responsable opérationnel chantier | Section D | Affaire |
| Référent RST de l’affaire | Section D | Affaire |
| Rédacteur du compte rendu | Section C | Passation |
| Validateur du compte rendu | Section C | Passation |
| Responsable du plan de contrôle | Section D, rôle `CONTROL_PLAN_AUTHOR` | Affaire / plan |
| Validateur du plan de contrôle | Section D, rôle `CONTROL_PLAN_VALIDATOR` | Affaire / plan |
| Responsable de la visite initiale | Section D, rôle `INITIAL_VISIT_OWNER` | Démarrage |
| Participant RST à la visite | Section D, rôle `INITIAL_VISIT_RST_PARTICIPANT` | Visite |
| Préparateur des interventions | Section D, rôle `INTERVENTION_PLANNER` | Affaire / demandes |
| Personne qui affecte les techniciens | Section D, rôle `TECHNICIAN_ASSIGNER` | Affaire / planning |
| Technicien réellement affecté | Page campagne / intervention existante | Exécution réelle |
| Coordinateur laboratoire | Section D, rôle `LAB_COORDINATOR` | Affaire / laboratoire |
| Coordinateur terrain | Section D, rôle `FIELD_COORDINATOR` | Affaire / terrain |
| Responsable essais externes | Section D, rôle `EXTERNAL_TESTS_OWNER` | Affaire / sous-traitance |
| Responsable restitution | Section D, rôle `RESULTS_COORDINATOR` | Affaire / demandes |
| Validateur rapport | Section D ou demande selon le niveau réel | Rapport |
| Responsable d’une action ponctuelle | Section H — Actions | Action uniquement |

Une même personne peut cumuler plusieurs rôles, mais le cumul doit être visible. Ne pas fusionner les rôles dans un seul intitulé.

---

# 6. Règles d’organisation automatique

Créer ou réutiliser un mécanisme de règles de proposition selon :

- agence ;
- secteur ;
- domaine ;
- type d’opération ;
- éventuellement filiale ou laboratoire.

Structure logique recommandée :

```text
organization_default_rules
- uid
- agency_key
- sector_key nullable
- operation_type nullable
- domain nullable
- role_code
- person_id
- active
- valid_from nullable
- valid_to nullable
- priority
- comment
```

Exemple métier :

```text
Agence : Auvergne
Rôle : CONTROL_PLAN_AUTHOR
Personne proposée : Christelle
Statut initial de l’affectation : À confirmer
Source : Règle automatique agence
```

Ne jamais coder :

```javascript
if (agence === 'Auvergne') responsable = 'Christelle'
```

La page doit appeler le backend ou un service métier qui renvoie les propositions applicables.

Prévoir un bouton :

```text
Appliquer l’organisation proposée
```

Comportement :

- ajouter seulement les rôles manquants ;
- ne pas écraser une affectation confirmée ;
- signaler les conflits ;
- placer les nouvelles propositions en statut `À confirmer` ;
- conserver la source de la proposition ;
- être idempotent.

---

# 7. Règles conditionnelles et blocages

## Si un plan de contrôle est requis

Exiger avant traitement de la passation :

- `CONTROL_PLAN_AUTHOR` confirmé ;
- `CONTROL_PLAN_VALIDATOR` confirmé ou explicitement non applicable selon la règle métier ;
- statut du plan renseigné ;
- CCTP reçu ou documents manquants explicitement identifiés ;
- date cible de préparation.

## Si une visite initiale est requise

Exiger :

- `INITIAL_VISIT_OWNER` confirmé ;
- contact chantier ;
- date prévisionnelle ou motif d’impossibilité ;
- statut de visite ;
- participant RST prévu ou indication à définir.

## Si des besoins terrain existent

Exiger :

- `INTERVENTION_PLANNER` ;
- `TECHNICIAN_ASSIGNER` ;
- `FIELD_COORDINATOR` si applicable.

## Si des besoins laboratoire existent

Exiger :

- `LAB_COORDINATOR` ;
- laboratoire prévu ou statut à définir ;
- responsable de restitution si les résultats nécessitent une synthèse.

## Si des essais externes existent

Exiger :

- `EXTERNAL_TESTS_OWNER` ;
- personne qui valide le coût ou l’imputation, si nécessaire ;
- statut de consultation du prestataire.

## Si la décision est partiellement acceptée ou acceptée sous réserves

Exiger :

- réserves ;
- périmètre accepté ;
- prestations exclues ;
- responsabilités restant au chantier.

## Si la décision est hors périmètre ou refusée

Exiger :

- motif ;
- personne ayant validé la décision ;
- information du demandeur.

---

# 8. Indicateur de préparation / readiness

Ajouter en haut de la page une synthèse opérationnelle.

Cartes ou indicateurs :

- Organisation : X rôles confirmés / Y requis ;
- Documents : X reçus / Y obligatoires ;
- CCTP : reçu / incomplet / absent ;
- Plan de contrôle : statut ;
- Visite initiale : statut ;
- Demandes : X prévues / Y créées ;
- Actions ouvertes ;
- Blocages.

Afficher une liste claire :

```text
Organisation incomplète
- Responsable du plan de contrôle non confirmé
- Préparateur des interventions non désigné
- Responsable de la visite initiale non désigné
```

Le calcul des blocages doit idéalement être réalisé ou validé par le backend afin de garantir la même règle partout.

Prévoir une réponse de type :

```json
{
  "ready_to_process": false,
  "blocking_items": [
    {
      "code": "CONTROL_PLAN_AUTHOR_MISSING",
      "label": "Responsable du plan de contrôle non confirmé",
      "section": "organization"
    }
  ],
  "warnings": []
}
```

Cliquer sur un blocage doit faire défiler ou ouvrir la section concernée si l’architecture UI le permet.

---

# 9. Actions principales de la page

Prévoir des boutons contextuels :

- Enregistrer le brouillon ;
- Modifier ;
- Annuler les modifications ;
- Appliquer l’organisation proposée ;
- Générer les actions de démarrage ;
- Préparer les demandes ;
- Ouvrir l’affaire ;
- Voir les demandes ;
- Ouvrir le plan de contrôle ;
- Planifier / ouvrir la visite initiale ;
- Marquer la passation comme traitée ;
- Archiver.

Ne pas afficher tous les boutons en permanence. Les rendre contextuels selon l’état.

### `Préparer les demandes`

Cette action doit ouvrir un écran ou une modale de prévisualisation.

Afficher les besoins structurés et les lignes de plan sélectionnables :

```text
☑ Contrôles de portance — 12 points
☑ Identifications de sols — 4 échantillons
☐ Étude de traitement
☑ Essais externes de cisaillement
```

L’utilisateur doit pouvoir :

- grouper plusieurs besoins dans une même demande ;
- séparer les besoins ;
- modifier le titre ;
- définir priorité et échéance ;
- choisir le responsable ;
- vérifier les documents liés ;
- créer les demandes.

Chaque demande créée doit :

- être directement liée à l’affaire RST ;
- conserver facultativement `source_passation_id` ;
- conserver éventuellement les identifiants des lignes de plan de contrôle sources ;
- ne pas dépendre de la passation pour son cycle de vie.

La création doit être idempotente. Ne pas recréer une demande déjà générée depuis la même sélection sans avertissement explicite.

---

# 10. Workflow attendu

```text
1. Réception / création de la passation
2. Enregistrement en brouillon
3. Identification des participants
4. Formalisation de la demande initiale
5. Définition du périmètre accepté et exclu
6. Rattachement à l’affaire RST
7. Application des propositions d’organisation
8. Confirmation des responsables
9. Réception et analyse du CCTP
10. Préparation du plan de contrôle prévisionnel
11. Planification de la visite initiale
12. Réalisation de la visite
13. Mise à jour du plan de contrôle
14. Identification et préparation des demandes
15. Création des demandes
16. Préparation des campagnes / interventions
17. Affectation réelle des techniciens
18. Réalisation des prestations
19. Restitution et rapports
20. Clôture des demandes
21. Clôture ultérieure de l’affaire lorsque tout est terminé
```

La passation peut passer au statut `Traitée` après l’étape 15, même si les prestations ne sont pas encore réalisées.

---

# 11. Modèle de données recommandé

Adapter les noms aux conventions réelles du backend.

## 11.1 Extension de `passations`

Ajouter ou représenter les champs suivants :

```text
workflow_status
business_decision
request_object
expected_result
urgency_level
requested_start_date
requested_delivery_date
deadline_reason
request_commitment_status
request_recurrence
initial_request
requested_scope
accepted_scope
excluded_scope
remaining_chantier_responsibilities
reservations
decision_reason
decision_validated_by_person_id
decision_date
qualified_by_person_id
qualified_at
processed_by_person_id
processed_at
```

Pour les informations de démarrage, utiliser soit une table 1:1 dédiée, soit un sous-modèle cohérent avec l’architecture existante.

## 11.2 Participants de passation

Table logique : `passation_participants`.

Champs recommandés :

```text
uid
passation_id
person_id nullable
display_name
function_label
entity_label
meeting_role_code
attendance_status
represented_person_or_entity
is_decision_maker
comment
created_at
updated_at
```

## 11.3 Affectations de rôles

Privilégier une table générique liée à l’affaire : `affaire_role_assignments` ou équivalent.

```text
uid
affaire_rst_id
passation_id nullable
demande_id nullable
role_code
person_id nullable
display_name_snapshot
entity_snapshot
scope_type
scope_label
assignment_status
assignment_source
assigned_at
confirmed_at
assigned_by_person_id nullable
replaced_assignment_id nullable
comment
created_at
updated_at
```

Contraintes :

- empêcher deux affectations actives identiques pour le même rôle et le même périmètre, sauf si le métier autorise plusieurs personnes ;
- conserver l’historique des remplacements ;
- ne pas écraser une affectation confirmée lors de l’application des règles automatiques ;
- autoriser une personne externe sans `person_id` avec snapshot obligatoire.

## 11.4 Préparation du démarrage

Table logique possible : `passation_startup_preparation`.

```text
uid
passation_id
cctp_status
cctp_version
cctp_date
cctp_analysis_required
cctp_analysis_status
cctp_analysis_date
control_plan_required
control_plan_existing
control_plan_existing_treatment
control_plan_status
control_plan_target_draft_date
control_plan_target_validation_date
control_plan_id nullable
control_plan_revision_after_visit
initial_visit_required
initial_visit_reason
initial_visit_timing
initial_visit_planned_date
initial_visit_confirmed_date
initial_visit_actual_date
initial_visit_status
site_contact_person_id nullable
site_contact_snapshot
meeting_point
site_access
safety_induction_required
specific_ppe
required_documents
visit_report_required
visit_report_document_id nullable
comment
created_at
updated_at
```

## 11.5 Règles d’organisation

Table logique : `organization_default_rules`.

Ne pas mettre les personnes en dur dans le composant React.

## 11.6 Plan de contrôle

Si absent, prévoir :

```text
control_plans
control_plan_lines
```

Le plan est lié directement à l’affaire, avec un lien facultatif vers la passation source.

## 11.7 Demandes

Ajouter seulement si nécessaire :

```text
source_passation_id nullable
```

Ne pas modifier la relation principale entre demande et affaire.

---

# 12. Contrats API recommandés

Adapter aux conventions existantes.

## GET `/passations/:uid`

Doit retourner :

```json
{
  "uid": 1,
  "affaire_rst_id": 10,
  "workflow_status": "BROUILLON",
  "business_decision": "NON_DECIDEE",
  "participants": [],
  "role_assignments": [],
  "documents": [],
  "startup_preparation": {},
  "needs": [],
  "actions": [],
  "readiness": {
    "ready_to_process": false,
    "blocking_items": [],
    "warnings": []
  }
}
```

## POST `/passations`

Accepter le payload complet avec les collections imbriquées selon les conventions actuelles du backend.

## PUT `/passations/:uid`

Mettre à jour de manière transactionnelle :

- formulaire ;
- participants ;
- affectations décidées dans la passation ;
- documents ;
- préparation du démarrage ;
- besoins ;
- actions.

Ne pas supprimer silencieusement des affectations historiques ou des objets déjà liés à des demandes.

## GET `/passations/filters`

Étendre avec :

- statuts de workflow ;
- décisions métier ;
- rôles de participant ;
- statuts de présence ;
- codes de rôles ;
- statuts d’affectation ;
- sources d’affectation ;
- statuts documentaires ;
- statuts CCTP ;
- statuts plan de contrôle ;
- statuts visite initiale ;
- types d’actions ;
- niveaux d’urgence.

## GET `/organization/defaults`

Paramètres possibles :

```text
agency
sector
operation_type
domain
affaire_rst_id
```

Retourner les propositions de rôles.

## POST `/passations/:uid/apply-organization-defaults`

- idempotent ;
- n’écrase pas les rôles confirmés ;
- renvoie les affectations et les conflits.

## POST `/passations/:uid/generate-startup-actions`

- idempotent ;
- génère seulement les actions applicables ;
- ne duplique pas les actions existantes.

## GET `/passations/:uid/readiness`

Retourne les blocages et avertissements.

## POST `/passations/:uid/mark-processed`

- vérifie les règles de readiness côté backend ;
- refuse avec une erreur métier structurée si des blocages subsistent ;
- renseigne `processed_at` et `processed_by` ;
- ne clôture aucune demande ni affaire.

## POST `/passations/:uid/prepare-demandes/preview`

Retourne les regroupements proposés sans créer de demandes.

## POST `/passations/:uid/prepare-demandes`

Crée les demandes après confirmation utilisateur.

---

# 13. Adaptation précise de `PassationPage.jsx`

## État local

Étendre l’état avec :

```text
participants
roleAssignments
startupPreparation
structuredNeeds
readiness
```

Conserver :

```text
form
documents
actions
isEditing
```

## Chargement

Lors du chargement d’une passation existante, extraire :

```javascript
const {
    documents,
    actions,
    participants,
    role_assignments,
    startup_preparation,
    structured_needs,
    readiness,
    ...rest
} = passation
```

Adapter le code aux noms réels choisis par le backend.

## Sauvegarde

Le payload doit contenir toutes les sous-structures.

Ne pas filtrer une ligne structurée uniquement sur le nom si elle possède déjà un identifiant backend.

Préserver les UID des lignes existantes pour permettre une vraie mise à jour et éviter les suppressions/recréations inutiles.

## Composants de ligne

Créer des composants séparés, dans le même fichier ou dans des fichiers dédiés selon les conventions du projet :

- `ParticipantRow` ;
- `RoleAssignmentRow` ;
- `StructuredNeedRow` ;
- évolution de `DocRow` ;
- évolution de `ActionRow`.

Réutiliser les composants de sélection de collaborateurs/contacts déjà présents dans le projet.

## Mode lecture / édition

Respecter le fonctionnement actuel :

- lecture seule lorsque la passation n’est pas en modification ;
- édition explicite ;
- annulation réinitialisant toutes les sous-collections ;
- aucune perte de données lorsque l’utilisateur annule.

## Métriques

Remplacer ou compléter les métriques actuelles avec :

- rôles confirmés / requis ;
- documents reçus / obligatoires ;
- statut du plan de contrôle ;
- statut de la visite initiale ;
- demandes prévues / créées ;
- blocages.

Conserver éventuellement source et phase dans le bandeau de l’affaire.

## Validation frontend

Le frontend peut afficher les erreurs et empêcher certaines actions, mais le backend reste la source de vérité.

La simple sauvegarde en brouillon doit rester plus permissive que l’action `Marquer comme traitée`.

---

# 14. Cas concret A432 à couvrir

Le système doit pouvoir enregistrer sans ambiguïté le cas suivant.

## Demande initiale

```text
Mise à disposition d’un technicien du laboratoire RA.
```

## Périmètre accepté

```text
Étude de la possibilité de mettre un technicien à disposition,
sous réserve de disponibilité et de planification.
```

## Hors périmètre du laboratoire RA

```text
- pilotage du laboratoire chantier ;
- organisation générale du dispositif de contrôle ;
- gestion des FTAE ;
- définition du circuit de restitution ;
- responsabilité technique globale de la mission ;
- recherche et contractualisation des laboratoires à la place du RCE,
  sauf demande complémentaire explicitement acceptée.
```

## Répartition attendue

| Sujet | Responsable attendu | Portée |
|---|---|---|
| Organisation globale de la mission | RCE chantier | Chantier |
| Définition des besoins de contrôle | RCE / équipe chantier avec appui si demandé | Chantier |
| Gestion des FTAE | RCE chantier | Chantier |
| Exécution d’essais FTAE | LC2, GT ou laboratoire désigné | Exécution |
| Vérification de disponibilité d’un technicien RA | Responsable d’affectation du labo RA | Ressource |
| Appui technique RST RA | Référent RST | Conseil / cadrage |
| Préparation des interventions du technicien prêté | Personne explicitement désignée | À confirmer |
| Restitution globale | Personne explicitement désignée | Ne pas présumer |

Le fait de désigner un technicien ou un laboratoire exécutant ne doit jamais transférer automatiquement le pilotage de la mission.

Créer un avertissement si le périmètre accepté mentionne uniquement une mise à disposition de ressource mais que les rôles de pilotage sont laissés vides ou affectés implicitement au fournisseur de la ressource.

---

# 15. Critères d’acceptation fonctionnels

## Scénario 1 — Affaire Auvergne

Étant donné une passation liée à une affaire de l’agence Auvergne :

- cliquer sur `Appliquer l’organisation proposée` ;
- Christelle est proposée comme responsable du plan de contrôle ;
- le statut est `À confirmer` ;
- l’utilisateur peut confirmer, remplacer ou refuser ;
- une réapplication ne crée pas de doublon ;
- une affectation confirmée n’est pas écrasée.

## Scénario 2 — Plan de contrôle requis

Si le plan de contrôle est requis :

- la passation ne peut pas être marquée `Traitée` sans responsable confirmé ;
- le système signale précisément le rôle manquant ;
- le CCTP absent peut être accepté seulement si le document manquant est identifié et si le workflow autorise une décision sous réserves ;
- le plan peut rester prévisionnel au moment de la passation.

## Scénario 3 — Visite initiale requise

Si la visite est requise :

- le responsable de l’organisation est obligatoire ;
- une date prévisionnelle ou un motif de report est obligatoire ;
- le contact chantier est visible ;
- après réalisation, le statut peut demander un compte rendu ;
- les actions issues de la visite peuvent être ajoutées.

## Scénario 4 — Préparation des interventions

Si des besoins terrain ou laboratoire existent :

- le préparateur des interventions est identifiable ;
- la personne qui affecte les techniciens est identifiable ;
- aucun technicien n’est présumé affecté dans la passation ;
- l’affectation réelle se fait dans l’intervention/campagne.

## Scénario 5 — Cas A432

Si la demande initiale porte uniquement sur la mise à disposition d’un technicien :

- le périmètre accepté peut être limité à cette ressource ;
- les responsabilités de RCE, FTAE et restitution restent séparées ;
- aucun rôle de pilotage n’est automatiquement donné au laboratoire RA ;
- le compte rendu et la fiche affichent clairement les exclusions.

## Scénario 6 — Compatibilité historique

Pour une passation existante :

- elle continue à s’ouvrir ;
- les documents et actions restent visibles ;
- le champ historique `responsable` n’est pas perdu ;
- les nouvelles sections peuvent être vides ;
- l’utilisateur peut compléter et enregistrer sans perdre les anciennes données.

## Scénario 7 — Annulation de modification

- modifier participants, rôles, documents, démarrage et actions ;
- cliquer sur Annuler ;
- toutes les sous-structures reviennent aux données chargées ;
- aucune donnée partielle ne reste dans l’état local.

## Scénario 8 — Idempotence

- appliquer deux fois les règles d’organisation ;
- générer deux fois les actions de démarrage ;
- préparer deux fois les mêmes demandes ;
- aucun doublon silencieux ne doit être créé.

---

# 16. Tests à prévoir

## Backend

- validation des enums ;
- création / modification transactionnelle ;
- conservation des affectations historiques ;
- protection des rôles confirmés ;
- règles d’organisation par agence ;
- readiness ;
- blocages conditionnels ;
- idempotence ;
- absence de suppression en cascade des demandes ;
- migration des anciennes passations.

## Frontend

- chargement nouvelle / existante ;
- édition et annulation ;
- ajout / suppression de participants ;
- sélection d’une personne interne et saisie externe ;
- application des rôles proposés ;
- confirmation / remplacement ;
- affichage des blocages ;
- sections conditionnelles ;
- sauvegarde du payload complet ;
- navigation vers affaire, demandes, plan de contrôle et visite ;
- responsive des tables.

## Tests métier

- Auvergne / Christelle ;
- A432 / simple mise à disposition d’un technicien ;
- plan de contrôle requis sans CCTP ;
- visite requise sans responsable ;
- essais externes sans coordinateur ;
- acceptation sous réserves ;
- refus ou hors périmètre.

---

# 17. Ordre d’implémentation recommandé

## Étape 1 — Analyse de l’existant

- localiser modèles, migrations, schemas, repositories, routes et tests des passations ;
- localiser le référentiel des personnes ;
- localiser les modèles d’affaires, demandes, campagnes et interventions ;
- localiser les règles ou configurations par agence ;
- vérifier si un module plan de contrôle existe déjà.

## Étape 2 — Modèle backend

- migration compatible ;
- participants ;
- rôles ;
- préparation du démarrage ;
- enums ;
- readiness.

## Étape 3 — API

- enrichir GET/POST/PUT ;
- ajouter defaults ;
- ajouter readiness ;
- ajouter mark-processed ;
- ajouter génération d’actions.

## Étape 4 — Frontend PassationPage

- nouvelle structure A–I ;
- tables participants et rôles ;
- CCTP ;
- plan ;
- visite ;
- indicateurs ;
- blocages ;
- actions contextuelles.

## Étape 5 — Préparation des demandes

- écran de prévisualisation ;
- regroupement ;
- création idempotente ;
- lien facultatif à la passation.

## Étape 6 — Plan de contrôle

- réutiliser le module existant ou créer le minimum cohérent ;
- lignes ;
- lien aux demandes ;
- adaptation après visite.

## Étape 7 — Tests et migration

- données historiques ;
- cas Auvergne ;
- cas A432 ;
- non-régression.

---

# 18. Résultat attendu

À la fin de l’implémentation, une passation ne doit plus être seulement une fiche de texte reliée à une affaire.

Elle doit produire un cadrage exploitable :

```text
Affaire RST liée
Demande initiale tracée
Périmètre accepté défini
Périmètre exclu défini
Participants identifiés
RCE identifié
Référent RST identifié
Responsable du plan de contrôle identifié
Validateur du plan identifié
Responsable de la visite initiale identifié
Préparateur des interventions identifié
Responsable d’affectation des techniciens identifié
CCTP et documents suivis
Plan de contrôle prévisionnel cadré
Visite initiale prévue
Demandes à créer identifiées
Blocages visibles
Actions générées
Passation marquée traitée lorsque le cadrage est transféré
```

La règle métier centrale est :

> Fournir un technicien, réaliser un essai ou apporter un appui technique ne transfère jamais automatiquement la responsabilité de piloter la mission, le laboratoire chantier, le plan de contrôle, les FTAE ou la restitution globale.

Chaque responsabilité doit être choisie, affichée, confirmée et traçable.
