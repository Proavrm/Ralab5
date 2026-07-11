"""Catalogues configurables du module G3 — aucune donnée chantier hardcodée."""

from __future__ import annotations

G3_MISSION_STATUS_OPTIONS = [
    "À préparer",
    "En attente documents",
    "Programme à valider",
    "Reconnaissances planifiées",
    "Reconnaissances en cours",
    "Analyse en cours",
    "Avis en cours",
    "Rapport en cours",
    "Terminé",
    "Archivé",
]

G3_MISSION_TYPE_OPTIONS = [
    "Terrassements",
    "Voiries",
    "Plateformes",
    "Fondations",
    "Remblais techniques",
    "Bassins / hydraulique",
    "Talus",
    "Soutènements",
    "Réemploi matériaux",
    "Expertise / désordre",
    "Contrôle chantier",
    "Autre",
]

G3_DOCUMENT_TYPE_OPTIONS = [
    "G1 ES+PGC",
    "G2 AVP",
    "G2 PRO",
    "G4",
    "INFOS-DIAG",
    "CCTP",
    "DPGF",
    "Plans EXE",
    "Plans PRO",
    "Plans VRD",
    "Plans terrassement",
    "Plans fondations",
    "Plans réseaux",
    "Coupes / profils",
    "Cubatures",
    "Planning travaux",
    "DICT / réseaux",
    "Note technique AO",
    "Compte rendu chantier",
    "Photos",
    "Autre",
]

G3_OBJECTIVE_PRIORITY_OPTIONS = ["Faible", "Moyenne", "Forte", "Critique"]

G3_OBJECTIVE_STATUS_OPTIONS = [
    "À faire",
    "En cours",
    "En attente",
    "Réalisé",
    "Non retenu",
]

G3_DEFAULT_OBJECTIVE_TEMPLATES = [
    "Confirmer les hypothèses géotechniques retenues en étude",
    "Vérifier les structures de chaussée retenues en EXE",
    "Reconnaître les épaisseurs des matériaux existants",
    "Identifier les matériaux réutilisables",
    "Optimiser les déblais/remblais",
    "Valider les plateformes",
    "Réceptionner les fonds de fouille",
    "Contrôler les remblais techniques",
    "Suivre l'état hydrique des sols",
    "Gérer les adaptations chantier",
    "Formaliser les points d'arrêt géotechniques",
    "Générer les avis G3",
    "Préparer le rapport final G3",
]

G3_ZONE_TYPE_OPTIONS = [
    "Voirie PL",
    "Voirie VL",
    "Parking",
    "Plateforme",
    "Terrassement général",
    "Bassin EP",
    "Remblais techniques",
    "Fondations",
    "Bâtiment",
    "Talus",
    "Soutènement",
    "Zone de réemploi",
    "Stock matériaux",
    "Zone sensible",
    "Zone existante",
    "Zone extension",
    "Autre",
]

G3_ZONE_RISK_OPTIONS = ["Faible", "Moyen", "Fort", "Critique"]

G3_INTERVENTION_TYPE_OPTIONS = [
    "Visite initiale chantier",
    "Sondage à la pelle",
    "Carottage chaussée",
    "Reconnaissance structure existante",
    "Prélèvement matériau",
    "Essai EV2",
    "Essai PANDA",
    "Essai pénétrométrique",
    "Contrôle compactage",
    "Réception fond de fouille",
    "Contrôle plateforme",
    "Contrôle remblai technique",
    "Visite point d'arrêt",
    "Avis géotechnique",
    "Réunion chantier",
    "Analyse documentaire",
    "Autre",
]

G3_PROGRAMME_STATUS_OPTIONS = [
    "À prévoir",
    "À planifier",
    "Planifié",
    "En cours",
    "Réalisé",
    "Annulé",
    "Reporté",
    "À compléter",
]

G3_INTERVENTION_REALIZED_STATUS_OPTIONS = [
    "Brouillon",
    "À compléter",
    "Validé",
    "Transmis",
    "Archivé",
]

G3_PROGRAMME_DEFAULT_TEMPLATE = [
    {"type": "Visite initiale chantier", "objective": "Première reconnaissance du site et des contraintes"},
    {"type": "Analyse documentaire", "objective": "Revue des documents de référence transmis"},
    {"type": "Sondage à la pelle", "objective": "Reconnaissance des formations en place"},
    {"type": "Carottage chaussée", "objective": "Caractérisation des structures existantes"},
    {"type": "Prélèvement matériau", "objective": "Prélèvements pour essais laboratoire et réemploi"},
    {"type": "Essai EV2", "objective": "Contrôle portance des plateformes"},
    {"type": "Essai PANDA", "objective": "Contrôle compactage si nécessaire"},
    {"type": "Réception fond de fouille", "objective": "Validation des fonds de fouille avant bétonnage"},
    {"type": "Avis géotechnique", "objective": "Avis G3 intermédiaire"},
    {"type": "Autre", "objective": "Rapport final G3", "expected_deliverable": "G3008 Rapport final G3"},
]

G3_TEST_TYPE_OPTIONS = [
    "EV2",
    "PANDA",
    "Pénétromètre dynamique",
    "Carottage",
    "Sondage pelle",
    "Teneur en eau",
    "VBS",
    "Granulométrie",
    "IPI",
    "Proctor",
    "Compactage",
    "Densité",
    "Portance",
    "Analyse environnementale",
    "Autre",
]

G3_TEST_STATUS_OPTIONS = [
    "En attente",
    "En cours",
    "Reçu labo",
    "Analysé",
    "Validé",
    "Annulé",
]

G3_CONFORMITY_OPTIONS = [
    "Conforme",
    "Non conforme",
    "En attente",
    "Non applicable",
]

G3_WEATHER_OPTIONS = ["Beau", "Nuageux", "Pluie", "Vent", "Gel", "Autre"]

G3_HYDRIC_CONDITION_OPTIONS = ["Sec", "Humide", "Saturation", "En eau", "Non applicable"]

G3_INTERVENTION_PAYLOAD_FIELDS = {
    "Essai EV2": [
        {"key": "ev2_module", "label": "Module EV2 (MPa)", "type": "text"},
        {"key": "ev2_target", "label": "Valeur attendue", "type": "text"},
        {"key": "ev2_location", "label": "Localisation essai", "type": "text"},
    ],
    "Essai PANDA": [
        {"key": "panda_qd", "label": "Qd (MPa)", "type": "text"},
        {"key": "panda_layers", "label": "Nombre de couches", "type": "text"},
    ],
    "Sondage à la pelle": [
        {"key": "sondage_depth", "label": "Profondeur (m)", "type": "text"},
        {"key": "sondage_layers", "label": "Description des couches", "type": "textarea"},
    ],
    "Carottage chaussée": [
        {"key": "carottage_depth", "label": "Profondeur carotte (cm)", "type": "text"},
        {"key": "carottage_structure", "label": "Structure identifiée", "type": "textarea"},
    ],
    "Réception fond de fouille": [
        {"key": "fouille_nature", "label": "Nature du sol", "type": "text"},
        {"key": "fouille_decision", "label": "Décision réception", "type": "text"},
    ],
    "Contrôle plateforme": [
        {"key": "plateforme_cote", "label": "Cote plateforme", "type": "text"},
        {"key": "plateforme_decision", "label": "Décision", "type": "text"},
    ],
}

G3_NOTICE_TYPE_OPTIONS = [
    "Avis terrassement",
    "Avis plateforme",
    "Avis fondation",
    "Avis remblai technique",
    "Avis voirie",
    "Avis bassin",
    "Avis talus",
    "Avis réemploi matériaux",
    "Avis adaptation",
    "Avis non-conformité",
    "Avis point d'arrêt",
    "Avis final",
]

G3_NOTICE_STATUS_OPTIONS = ["Brouillon", "À relire", "Validé", "Transmis", "Annulé"]

G3_HOLD_POINT_STATUS_OPTIONS = [
    "À venir",
    "Ouvert",
    "En attente essais",
    "En attente avis",
    "Validé",
    "Validé avec réserves",
    "Refusé",
    "Clos",
]

G3_HOLD_POINT_TEMPLATES = [
    {"code": "PA01", "label": "Avant démarrage terrassements"},
    {"code": "PA02", "label": "Après décapage"},
    {"code": "PA03", "label": "Avant remblais techniques"},
    {"code": "PA04", "label": "Pendant remblais techniques"},
    {"code": "PA05", "label": "Avant fermeture plateforme"},
    {"code": "PA06", "label": "À l'ouverture des fouilles"},
    {"code": "PA07", "label": "Avant bétonnage fondations"},
    {"code": "PA08", "label": "En cas de venue d'eau"},
    {"code": "PA09", "label": "En cas de sol non conforme"},
    {"code": "PA10", "label": "Avant enrobés"},
    {"code": "PA11", "label": "Fin de mission"},
]

G3_DELIVERABLE_TYPE_OPTIONS = [
    "G3001 Note de cadrage G3",
    "G3002 Programme des reconnaissances",
    "G3003 Compte rendu de visite",
    "G3004 Avis G3",
    "G3005 Synthèse essais",
    "G3006 Fiche réception fond de fouille",
    "G3007 Synthèse réemploi matériaux",
    "G3008 Rapport final G3",
]

G3_DELIVERABLE_STATUS_OPTIONS = [
    "À produire",
    "Brouillon",
    "Validé",
    "Transmis",
    "Archivé",
]

G3_NOTICE_FORMULATION_TEMPLATES = {
    "Avis terrassement": (
        "Suite aux reconnaissances réalisées dans le cadre de la mission {reference}, "
        "concernant le chantier {chantier}, zone {zone}."
    ),
    "Avis plateforme": (
        "Au regard des essais et contrôles réalisés sur la plateforme {zone}, "
        "dans le cadre de la mission {reference}."
    ),
    "Avis fondation": (
        "Suite à la réception du fond de fouille {zone}, mission {reference} — chantier {chantier}."
    ),
    "Avis remblai technique": (
        "Concernant la mise en œuvre du remblai technique, zone {zone}, mission {reference}."
    ),
    "Avis voirie": (
        "Au regard des reconnaissances et contrôles sur la voirie, zone {zone}, mission {reference}."
    ),
    "Avis final": (
        "Synthèse géotechnique de fin de mission {reference} — chantier {chantier}."
    ),
}

G3_CATALOGS = {
    "mission_status": G3_MISSION_STATUS_OPTIONS,
    "mission_types": G3_MISSION_TYPE_OPTIONS,
    "document_types": G3_DOCUMENT_TYPE_OPTIONS,
    "objective_priorities": G3_OBJECTIVE_PRIORITY_OPTIONS,
    "objective_statuses": G3_OBJECTIVE_STATUS_OPTIONS,
    "default_objectives": G3_DEFAULT_OBJECTIVE_TEMPLATES,
    "zone_types": G3_ZONE_TYPE_OPTIONS,
    "zone_risk_levels": G3_ZONE_RISK_OPTIONS,
    "intervention_types": G3_INTERVENTION_TYPE_OPTIONS,
    "programme_statuses": G3_PROGRAMME_STATUS_OPTIONS,
    "intervention_realized_statuses": G3_INTERVENTION_REALIZED_STATUS_OPTIONS,
    "programme_default_template": G3_PROGRAMME_DEFAULT_TEMPLATE,
    "test_types": G3_TEST_TYPE_OPTIONS,
    "test_statuses": G3_TEST_STATUS_OPTIONS,
    "conformity_options": G3_CONFORMITY_OPTIONS,
    "weather_options": G3_WEATHER_OPTIONS,
    "hydric_condition_options": G3_HYDRIC_CONDITION_OPTIONS,
    "intervention_payload_fields": G3_INTERVENTION_PAYLOAD_FIELDS,
    "notice_types": G3_NOTICE_TYPE_OPTIONS,
    "notice_statuses": G3_NOTICE_STATUS_OPTIONS,
    "hold_point_statuses": G3_HOLD_POINT_STATUS_OPTIONS,
    "hold_point_templates": G3_HOLD_POINT_TEMPLATES,
    "notice_formulation_templates": G3_NOTICE_FORMULATION_TEMPLATES,
    "deliverable_types": G3_DELIVERABLE_TYPE_OPTIONS,
    "deliverable_statuses": G3_DELIVERABLE_STATUS_OPTIONS,
}
