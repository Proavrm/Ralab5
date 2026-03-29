"""
seed_passation2.py — Boulevard du Rhône – Vienne
Pesquisa a affaire RST por:
  1. Similaridade título/client nos Affaires RST existantes
  2. Référence NGE (/api/reference-affaires/rows) por título
  3. Études (/api/reference-etudes/rows) por título
  Se nada encontrado → cria affaire com client="Non communiqué" automaticamente.
Executa: python seed_passation2.py
"""
import json, sys, re, urllib.request, urllib.error, urllib.parse

API = "http://127.0.0.1:8000"

def req(method, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read()
            return json.loads(txt) if txt.strip() else None
    except urllib.error.HTTPError as e:
        print(f"  ✗ HTTP {e.code}: {e.read().decode()}")
        return None

def mots(s):
    return set(w.lower() for w in re.split(r'\W+', s or '') if len(w) > 3)

def score(titre_a, titre_b, client_a="", client_b=""):
    s  = len(mots(titre_a)  & mots(titre_b))  * 10
    s += len(mots(client_a) & mots(client_b)) * 8
    ta, tb = titre_a.lower(), titre_b.lower()
    if ta and tb and (ta in tb or tb in ta): s += 20
    return s

def search_rows(path, query, token, limit=8):
    q = urllib.parse.quote(query)
    return req("GET", f"{path}?search={q}&limit={limit}", token=token) or []

def next_ref(token):
    return (req("GET", "/api/affaires/next-ref", token=token) or {}).get("reference")

def create_affaire(ref, chantier, site, client, titulaire, responsable, token,
                   numero_etude="", affaire_nge="", filiale=""):
    return req("POST", "/api/affaires", token=token, body={
        "reference": ref, "chantier": chantier, "site": site,
        "client": client, "titulaire": titulaire, "responsable": responsable,
        "numero_etude": numero_etude, "affaire_nge": affaire_nge,
        "filiale": filiale, "statut": "En cours", "date_ouverture": "2026-03-18",
    })

# ── Données cible ──────────────────────────────────────────────────────────────
CHANTIER  = "Aménagement Boulevard du Rhône"
CLIENT    = "Vienne-Condrieu Agglomération"
SITE      = "Vienne (38)"
TITULAIRE = "NGE Routes"
RESP      = "Baptiste H."
# Mots clés pour la recherche
MOTS_RECHERCHE = ["boulevard", "rhone", "vienne", "aménagement"]

PASSATION = dict(
    date_passation="2026-03-18", source="Chantier NGE",
    operation_type="VRD / Réseaux", phase_operation="G2 DCE / G3",
    numero_etude="", numero_affaire_nge="",
    chantier=CHANTIER, client=CLIENT,
    entreprise_responsable="NGE Routes", agence="Saint-Priest", responsable=RESP,
    description_generale=(
        "Lot 1 – VRD. Aménagement du boulevard du Rhône à Vienne (38). "
        "MOE : SEGIC. Démarrage début août 2026. Environ 20 000 m³ de terres."
    ),
    contexte_marche="Zone urbaine sensible, proximité Rhône. Suivi déchets REVAM'APP. QAV à surveiller.",
    interlocuteurs_principaux="MOA : Vienne-Condrieu Agglomération\nMOE : SEGIC\nRST : Baptiste H.",
    points_sensibles=(
        "• Végétation : protection cyprès avant terrassement\n"
        "• Eau : proximité Rhône – risques pollution EP\n"
        "• Déchets : REVAM'APP + QAV à surveiller\n"
        "• Sol : 20 000 m³ terres, destination à confirmer"
    ),
    besoins_laboratoire="Contrôle remblais : Proctor, CBR, granulométrie. Essais portance.",
    besoins_terrain="Sondages reconnaissance VRD. Contrôle compactage couche par couche.",
    besoins_etude="Note géotechnique VRD. Dimensionnement chaussée. Stabilité berges.",
    besoins_g3="Suivi terrassement G3. Visa plans. Rapport fin de travaux.",
    besoins_essais_externes="Si terres contaminées : analyses laboratoire agréé.",
    besoins_equipements_specifiques="Matériel prélèvement eau. GPS protection arbres.",
    besoins_ressources_humaines="1 ingénieur RST (Baptiste H.). 1 technicien terrain.",
    synthese="Chantier VRD sensible proximité Rhône. Enjeux : protection végétation, gestion eaux, REVAM'APP. Démarrage août 2026.",
    notes="• FDE à faire avec Baptiste H.\n• REVAM'APP : vérifier QAV\n• Plan protection cyprès à établir avec MOE",
    documents=[
        dict(document_type="CCTP / CCAP",          is_received=False, version="",   document_date=None, comment="Demander à SEGIC"),
        dict(document_type="Plans VRD",             is_received=False, version="V0", document_date=None, comment=""),
        dict(document_type="Rapport G2 DCE",        is_received=False, version="",   document_date=None, comment=""),
        dict(document_type="Plan protection végétation", is_received=False, version="", document_date=None, comment="Arbres cyprès"),
    ],
    actions=[
        dict(action_label="Réflexe FDE – brief mission G3 Vienne",    responsable=RESP, echeance="2026-06-01", priorite="Normale", statut="À lancer", commentaire=""),
        dict(action_label="Obtenir plans VRD et G2 auprès de SEGIC",  responsable=RESP, echeance="2026-06-15", priorite="Haute",   statut="À lancer", commentaire=""),
        dict(action_label="Définir périmètre protection cyprès / MOE",responsable=RESP, echeance="2026-07-01", priorite="Haute",   statut="À lancer", commentaire="Avant tout terrassement"),
    ],
)

def main():
    print("🔑 Connexion…")
    token = (req("POST", "/api/auth/login", {"identifier": "marco@nge.fr"}) or {}).get("token")
    if not token: sys.exit("  ✗ Backend allumé ?")
    print("  ✓ OK\n")

    affaires_rst = req("GET", "/api/affaires", token=token) or []
    print(f"  {len(affaires_rst)} affaires RST dans la base.")

    affaire = None

    # ── 1. RST existantes ──────────────────────────────────────────────────────
    print(f"\n▶ 1. Recherche dans Affaires RST par titre/client…")
    scored = sorted(
        [(score(CHANTIER, a.get('chantier',''), CLIENT, a.get('client','')), a)
         for a in affaires_rst],
        key=lambda x: -x[0]
    )
    if scored and scored[0][0] >= 10:
        sc, best = scored[0]
        print(f"  Trouvé (score={sc}) : [{best['reference']}] {best.get('chantier','')} | client={best.get('client','')}")
        if input("  Confirmer ? (o/n) : ").strip().lower() == 'o':
            affaire = best

    # ── 2. Référence NGE par titre ─────────────────────────────────────────────
    if not affaire:
        print(f"\n▶ 2. Recherche dans Affaires NGE par titre…")
        candidats_nge = []
        for mot in MOTS_RECHERCHE:
            rows = search_rows("/api/reference-affaires/rows", mot, token)
            if rows:
                candidats_nge = sorted(rows,
                    key=lambda r: -score(CHANTIER, r.get('libelle') or r.get('libellé',''), CLIENT, ''))
                break
        if candidats_nge:
            print(f"  {len(candidats_nge)} candidat(s) :")
            for i, c in enumerate(candidats_nge[:5]):
                code = c.get('numero_affaire_complet') or c.get('numero_affaire','—')
                lib  = c.get('libelle') or c.get('libellé','—')
                sc   = score(CHANTIER, lib)
                print(f"  [{i}] {code:20} | {lib[:55]} (score={sc})")
            choix = input("  Utiliser pour créer une affaire RST ? (numéro ou 's') : ").strip()
            if choix != 's':
                try:
                    c = candidats_nge[int(choix)]
                    ref = next_ref(token)
                    affaire = create_affaire(
                        ref=ref,
                        chantier=c.get('libelle') or c.get('libellé') or CHANTIER,
                        site=SITE, client=CLIENT, titulaire=TITULAIRE, responsable=RESP,
                        affaire_nge=c.get('numero_affaire_complet') or c.get('numero_affaire',''),
                        token=token
                    )
                    if affaire:
                        print(f"  ✓ Affaire RST créée : {affaire['reference']} (depuis NGE)")
                except (ValueError, IndexError): pass
        else:
            print("  Rien trouvé dans Affaires NGE.")

    # ── 3. Études par titre ────────────────────────────────────────────────────
    if not affaire:
        print(f"\n▶ 3. Recherche dans Études par titre…")
        candidats_etudes = []
        for mot in MOTS_RECHERCHE:
            rows = search_rows("/api/reference-etudes/rows", mot, token)
            if rows:
                candidats_etudes = sorted(rows,
                    key=lambda r: -score(CHANTIER, r.get('nomAffaire','')))
                break
        if candidats_etudes:
            print(f"  {len(candidats_etudes)} candidat(s) :")
            for i, c in enumerate(candidats_etudes[:5]):
                num = c.get('nAffaire','—')
                nom = c.get('nomAffaire','—')
                sc  = score(CHANTIER, nom)
                print(f"  [{i}] {num:20} | {nom[:55]} (score={sc})")
            choix = input("  Utiliser pour créer une affaire RST ? (numéro ou 's') : ").strip()
            if choix != 's':
                try:
                    c = candidats_etudes[int(choix)]
                    ville = c.get('ville','')
                    dept  = c.get('dept','')
                    ref   = next_ref(token)
                    affaire = create_affaire(
                        ref=ref,
                        chantier=c.get('nomAffaire') or CHANTIER,
                        site=f"{ville} ({dept})" if ville and dept else ville or SITE,
                        client=CLIENT, titulaire=TITULAIRE, responsable=RESP,
                        numero_etude=c.get('nAffaire',''),
                        filiale=c.get('filiale',''),
                        token=token
                    )
                    if affaire:
                        print(f"  ✓ Affaire RST créée : {affaire['reference']} (depuis Études)")
                except (ValueError, IndexError): pass
        else:
            print("  Rien trouvé dans Études.")

    # ── 4. Fallback : créer avec client="Non communiqué" ──────────────────────
    if not affaire:
        print(f"\n▶ 4. Rien trouvé nulle part → création avec client = 'Non communiqué'")
        ref = next_ref(token)
        affaire = create_affaire(
            ref=ref, chantier=CHANTIER, site=SITE,
            client="Non communiqué", titulaire=TITULAIRE, responsable=RESP,
            token=token
        )
        if affaire:
            print(f"  ✓ Affaire RST créée : {affaire['reference']}")

    if not affaire:
        sys.exit("  ✗ Impossible de créer/trouver une affaire RST.")

    # ── Création passation ─────────────────────────────────────────────────────
    print(f"\n📋 Création passation → affaire {affaire['reference']} ({affaire.get('chantier','')})…")
    p = req("POST", "/api/passations", token=token, body={**PASSATION, "affaire_rst_id": affaire["uid"]})
    if p:
        print(f"  ✓ Passation {p['reference']} créée — {len(PASSATION['documents'])} docs · {len(PASSATION['actions'])} actions")
    else:
        print("  ✗ Échec création passation")

    print("\n✅ Terminé.")

if __name__ == "__main__":
    main()
