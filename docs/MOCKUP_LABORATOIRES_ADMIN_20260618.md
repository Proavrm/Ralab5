# Mockup & handoff — Laboratoires RST (Administration + dashboard)

**Date :** 2026-06-18  
**Statut :** v1 mockup + implémentation partielle  
**Preview :** `/mockups/laboratoires-admin` (React) · `novas folhas e rapports/mockup/AdminLaboratoires_Mockup_v1.html`

---

## Objectif produit

Centraliser les **15+ laboratoires RST** dans un référentiel unique, sans dupliquer le personnel :

| Besoin | Solution |
|--------|----------|
| Personnes du labo | **Utilisateurs** existants (`users.service_code`) |
| Responsable | `laboratoires.responsable_email` → profil utilisateur |
| Équipements | `qualite_equipment.labo_code` |
| Coords / distance chantier | `laboratoires.lat`, `lon`, `address` |
| En-têtes rapports | `laboratoires.report_header` |
| Dashboard labo | Filtre par labo utilisateur + **partagé** (demandes essais) |

> **Règle périmètre :** chaque laboratoire voit **ses** données ; les **demandes d'essais partagées** restent visibles selon règles métier (routage inter-labo).

---

## Wireframes

### 1. Administration → onglet Laboratoires (implémenté)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Administration    [ Utilisateurs ] [ Laboratoires ] [ Rôles ]           │
├─────────────────────────────────────────────────────────────────────────┤
│ Référentiel central · personnel via service_code                        │
├───┬────────────┬────────┬────────┬────────┬───────────────┬────────┬────┤
│Code│ Nom       │ Région │ Équipe │ Équip. │ Coords        │ Statut │ ✏️ │
├───┼────────────┼────────┼────────┼────────┼───────────────┼────────┼────┤
│ SP │Saint-Priest│ RA     │12 actif│ 84     │45.69, 4.94   │ Actif  │ ✏️ │
│ PDC│Pont-du-Ch. │ AUV    │ 9 actif│ 62     │45.79, 3.24   │ Actif  │ ✏️ │
└───┴────────────┴────────┴────────┴────────┴───────────────┴────────┴────┘
```

### 2. Modal fiche laboratoire XL (implémenté)

```
┌──────────────── Modal : Laboratoire SP ────────────────────────────────┐
│ [Équipe: 12]  [Équip: 84]  [Périmètre: labo + partagé]                 │
├────────────────────────────────────────────────────────────────────────┤
│ Identité · Adresse · En-tête rapports · Lat/Lon · Notes                │
│ Responsable ▼ [ Sylvain LHOPITAL ]                                     │
├──────────────── Personnel rattaché (read-only) ────────────────────────┤
│ Nom              │ Rôle        │ Niveau     │ Statut │ [Profil]        │
│ Sylvain LHOPITAL │ lab_manager │ Cadre      │ Actif  │                 │
│ Marco C. Pereira │ technician  │ Technicien │ Actif  │                 │
├──────────────── Équipements ───────────────────────────────────────────┤
│ 84 avec labo_code=SP · lien → /qualite?tab=equipment&labo=SP          │
├────────────────────────────────────────────────────────────────────────┤
│                                    [ Annuler ]  [ Enregistrer ]        │
└────────────────────────────────────────────────────────────────────────┘
```

### 3. Dashboard labo — vision cible (à brancher)

```
┌──────────────── Dashboard · Labo SP (Saint-Priest) ──────────────────────┐
│ KPI: Essais en cours │ Échantillons reçus │ Planning │ Équip. HS        │
├──────────────────────────────┬─────────────────────────────────────────┤
│ Demandes du labo SP          │ Partagé / routé vers SP                 │
│ DEM0042 · Eiffage · En cours │ DEM0051 · NGE essai · PDC→SP            │
│ DEM0038 · Colas · A planifier│                                         │
└──────────────────────────────┴─────────────────────────────────────────┘
```

Route existante : `/dashboard/labos/:slug` (`ResponsableLaboDashboardPage`) — profils encore hardcodés dans `responsibleLaboProfiles.js`. **Cible :** lire `laboratoires` BD + `service_code` session.

---

## Modèle de données

```
users.service_code  ──►  laboratoires.code
laboratoires.responsable_email  ──►  users.email
qualite_equipment.labo_code  ──►  laboratoires.code
affaire / passation  ──►  distance via laboratoires.lat/lon (lab_geo_catalog)
```

Alias labo : `AUV` → `PDC` (normalize_labo_code).

---

## API (implémenté)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/admin/labs` | Liste + staff_active_count + equipment |
| GET | `/api/admin/labs/{code}` | Fiche : staff, responsable, scope |
| PUT | `/api/admin/labs/{code}` | Màj identité, coords, responsable, notes |
| GET | `/api/qualite/equipment?labo_code=SP` | Équipements filtrés |

Fichiers backend :

- `app/services/laboratoire_detail_service.py`
- `app/repositories/laboratoires_repository.py`
- `app/core/database.py` (migrations colonnes)
- `api/admin.py`

Frontend :

- `pages/AdminPage.jsx` (onglet Laboratoires)
- `components/admin/LaboratoireGeoModal.jsx` (fiche XL)
- `pages/QualitePage.jsx` (filtre `?labo=`)
- `lib/labGeo.js` (`userMatchesLab`)

---

## Checklist implémentation

### Fait ✓

- [x] Colonnes BD `responsable_email`, `notes`, `qualite_equipment.labo_code`
- [x] Fiche labo avec personnel (read-only) + select responsable
- [x] Compteurs équipe / équipements dans liste admin
- [x] Lien Profil utilisateur depuis fiche labo
- [x] Filtre équipements Qualité par labo
- [x] Helpers matching labo (front + back)

### À faire ○

- [ ] Dashboard : filtrer données réelles par `service_code` utilisateur connecté
- [ ] Remplacer `responsibleLaboProfiles.js` par lecture BD
- [ ] Règles API « demande partagée » documentées et appliquées
- [ ] Script backfill `labo_code` sur équipements historiques
- [ ] CRUD création nouveau laboratoire (15+ labos)
- [ ] Tests pytest en CI (module laboratoire_detail_service)

---

## Parcours utilisateur

1. **Admin** ouvre `/admin?tab=labs` → édite coords SP → définit responsable.
2. **RH / admin** affecte techniciens : profil utilisateur → `service_code = SP`.
3. **Qualité** assigne `labo_code` aux équipements (ou filtre `/qualite?labo=SP`).
4. **Responsable SP** (futur) : dashboard auto-filtré SP + demandes essais partagées.

---

## Fichiers mockup

| Fichier | Usage |
|---------|--------|
| `frontend/react/src/pages/mockups/LaboratoiresAdminMockupPage.jsx` | Preview interactive in-app |
| `novas folhas e rapports/mockup/AdminLaboratoires_Mockup_v1.html` | HTML standalone (ouvrir dans le navigateur) |
| `docs/MOCKUP_LABORATOIRES_ADMIN_20260618.md` | Ce document |

---

## Notes pour reprise dev

- Ne **pas** créer table `personnel` séparée.
- Menu **Administration** (pas Outils) pour référentiels.
- Reiniciar FastAPI après pull pour migrations SQLite.
- Mockup ≠ prod : les chiffres SP/PDC dans le mock sont illustratifs.
