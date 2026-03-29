"""
seed_passations.py — RaLab5
Cria apenas a 2ª passation (Boulevard du Rhône – Vienne).
Procura a affaire RST por:
  1. Similaridade título/client nos Affaires RST existantes
  2. Référence NGE (/api/reference-affaires/rows) par titre
  3. Études (/api/reference-etudes/rows) par titre
  4. Choix manuel si rien trouvé
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
        print(f"  ✗ {method} {path} → HTTP {e.code}: {e.read().decode()}")
        return None

def get_token():
    d = req("POST", "/api/auth/login", {"identifier": "marco@nge.fr"})
    return d["token"] if d else None

def next_ref(token):
    d = req("GET", "/api/affaires/next-ref", token=token)
    return d["reference"] if d else None

# ── Similarité par mots ────────────────────────────────────────────────────────
def mots(s):
    return set(w.lower() for w in re.split(r'\W+', s or '') if len(w) > 3)

def score_titre(titre_a, titre_b, client_a="", client_b=""):
    s  = len(mots(titre_a)  & mots(titre_b))  * 10
    s += len(mots(client_a) & mots(client_b)) * 8
    ta, tb = titre_a.lower(), titre_b.lower()
    if ta and tb and (ta in tb or tb in ta): s += 20
    return s

# ── Recherche dans référence NGE ───────────────────────────────────────────────
def search_nge(query, token, limit=8):
    q = urllib.parse.quote(query)
    rows = req("GET", f"/api/reference-affaires/rows?search={q}&limit={limit}", token=token) or []
    return rows

# ── Recherche dans référence Études ───────────────────────────────────────────
def search_etudes(query, token, limit=8):
    q = urllib.parse.quote(query)
    rows = req("GET", f"/api/reference-etudes/rows?search={q}&limit={limit}", token=token) or []
    return rows

# ── Sélection interactive ──────────────────────────────────────────────────────
def pick(items, label_fn, prompt="Numéro"):
    for i, item in enumerate(items[:10]):
        print(f"  [{i}] {label_fn(item)}")
    while True:
        c = input(f"  {prompt} (ou 's' pour sauter) : ").strip()
        if c == 's': return None
        try:
            idx = int(c)
            if 0 <= idx < min(10, len(items)): return items[idx]
        except ValueError: pass
        print("  Entrée invalide.")

# ── Logique principale de recherche ───────────────────────────────────────────
def find_or_create_affaire(affaires_rst, chantier, client, token):
    """
    1. RST existantes par similarité titre/client
    2. Référence NGE par titre → propose création affaire RST
    3. Études par titre → propose création affaire RST
    4. Manuel
    """

    # ── 1. RST existantes ───────────────────────────────────────────────────
    scored_rst = sorted(
        [(score_titre(chantier, a.get('chantier',''), client, a.get('client','')), a)
         for a in affaires_rst],
        key=lambda x: -x[0]
    )
    best_score, best = scored_rst[0] if scored_rst else (0, None)

    if best_score >= 10:
        print(f"\n  ▶ Affaire RST trouvée (score={best_score}) :")
        print(f"    [{best['reference']}] {best.get('chantier','')} | client={best.get('client','')} | "
              f"etude={best.get('numero_etude','')} | nge={best.get('affaire_nge','')}")
        if input("    Confirmer ? (o/n) : ").strip().lower() == 'o':
            return best

    # ── 2. Référence NGE par titre ──────────────────────────────────────────
    print(f"\n  Recherche dans Affaires NGE pour «{chantier}»…")
    mots_cl = sorted(mots(chantier), key=len, reverse=True)
    candidats_nge = []
    for mot in mots_cl[:3]:
        candidats_nge = search_nge(mot, token)
        if candidats_nge: break

    if candidats_nge:
        # Score par titre
        candidats_nge = sorted(
            candidats_nge,
            key=lambda r: -score_titre(chantier, r.get('libelle') or r.get('libellé',''))
        )
        print(f"  {len(candidats_nge)} candidat(s) Affaires NGE :")
        for i, c in enumerate(candidats_nge[:5]):
            code = c.get('numero_affaire_complet') or c.get('numero_affaire') or c.get('n°affaire','—')
            lib  = c.get('libelle') or c.get('libellé','—')
            sc   = score_titre(chantier, lib)
            print(f"  [{i}] {code:20} | {lib[:55]} (score={sc})")
        choix = input("  Utiliser pour créer une affaire RST ? (numéro ou 's') : ").strip()
        if choix != 's':
            try:
                c = candidats_nge[int(choix)]
                code = c.get('numero_affaire_complet') or c.get('numero_affaire') or c.get('n°affaire','')
                lib  = c.get('libelle') or c.get('libellé') or chantier
                ref  = next_ref(token)
                if not ref: print("  ✗ Impossible d'obtenir une référence."); return None
                nouvelle = req("POST", "/api/affaires", token=token, body={
                    "reference": ref, "chantier": lib, "client": client,
                    "affaire_nge": code, "statut": "En cours",
                    "date_ouverture": "2026-03-18",
                })
                if nouvelle:
                    affaires_rst.append(nouvelle)
                    print(f"  ✓ Affaire RST créée : {nouvelle['reference']} – {nouvelle.get('chantier','')}")
                    return nouvelle
            except (ValueError, IndexError): pass

    # ── 3. Études par titre ─────────────────────────────────────────────────
    print(f"\n  Recherche dans Études pour «{chantier}»…")
    candidats_etudes = []
    for mot in mots_cl[:3]:
        candidats_etudes = search_etudes(mot, token)
        if candidats_etudes: break

    if candidats_etudes:
        candidats_etudes = sorted(
            candidats_etudes,
            key=lambda r: -score_titre(chantier, r.get('nomAffaire',''))
        )
        print(f"  {len(candidats_etudes)} candidat(s) Études :")
        for i, c in enumerate(candidats_etudes[:5]):
            num  = c.get('nAffaire','—')
            nom  = c.get('nomAffaire','—')
            sc   = score_titre(chantier, nom)
            print(f"  [{i}] {num:20} | {nom[:55]} (score={sc})")
        choix = input("  Utiliser pour créer une affaire RST ? (numéro ou 's') : ").strip()
        if choix != 's':
            try:
                c = candidats_etudes[int(choix)]
                ville = c.get('ville','')
                dept  = c.get('dept','')
                site  = f"{ville} ({dept})" if ville and dept else ville or dept
                ref   = next_ref(token)
                if not ref: print("  ✗ Impossible d'obtenir une référence."); return None
                nouvelle = req("POST", "/api/affaires", token=token, body={
                    "reference": ref,
                    "chantier": c.get('nomAffaire') or chantier,
                    "site": site, "client": client,
                    "numero_etude": c.get('nAffaire',''),
                    "filiale": c.get('filiale',''),
                    "statut": "En cours",
                    "date_ouverture": "2026-03-18",
                })
                if nouvelle:
                    affaires_rst.append(nouvelle)
                    print(f"  ✓ Affaire RST créée : {nouvelle['reference']} – {nouvelle.get('chantier','')}")
                    return nouvelle
            except (ValueError, IndexError): pass

    # ── 4. Choix manuel ─────────────────────────────────────────────────────
    print(f"\n  Choix manuel parmi les affaires RST :")
    return pick(
        [a for _, a in scored_rst],
        lambda a: f"{a['reference']:15} | {(a.get('chantier') or '—'):45} | client={a.get('client') or '—'}",
        "Numéro"
    )

# ── Données passation 2 ────────────────────────────────────────────────────────
PASSATION2 = dict(
    date_passation="2026-03-18", source="Chantier NGE",
    operation_type="VRD / Réseaux", phase_operation="G2 DCE / G3",
    numero_etude="", numero_affaire_nge="",
    chantier="Aménagement Boulevard du Rhône", client="Vienne-Condrieu Agglomération",
    entreprise_responsable="NGE Routes", agence="Saint-Priest", responsable="Baptiste H.",
    description_generale="Lot 1 – VRD. Aménagement du boulevard du Rhône à Vienne (38). MOE : SEGIC. Démarrage début août 2026. Environ 20 000 m³ de terres.",
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
    notes="• FDE à faire avec Baptiste H\n• REVAM'APP : vérifier QAV\n• Plan protection cyprès à établir",
    documents=[
        dict(document_type="CCTP / CCAP", is_received=False, version="", document_date=None, comment="Demander à SEGIC"),
        dict(document_type="Plans VRD", is_received=False, version="V0", document_date=None, comment=""),
        dict(document_type="Rapport G2 DCE", is_received=False, version="", document_date=None, comment=""),
        dict(document_type="Plan protection végétation", is_received=False, version="", document_date=None, comment="Arbres cyprès"),
    ],
    actions=[
        dict(action_label="Réflexe FDE – brief mission G3 Vienne", responsable="Baptiste H.", echeance="2026-06-01", priorite="Normale", statut="À lancer", commentaire=""),
        dict(action_label="Obtenir plans VRD et G2 auprès de SEGIC", responsable="Baptiste H.", echeance="2026-06-15", priorite="Haute", statut="À lancer", commentaire=""),
        dict(action_label="Définir périmètre protection cyprès avec MOE", responsable="Baptiste H.", echeance="2026-07-01", priorite="Haute", statut="À lancer", commentaire="Avant tout terrassement"),
    ],
)

def main():
    print("🔑 Connexion…")
    token = get_token()
    if not token: sys.exit("  ✗ Backend allumé ?")
    print("  ✓ OK\n")

    affaires_rst = req("GET", "/api/affaires", token=token) or []
    print(f"  {len(affaires_rst)} affaires RST dans la base.\n")

    print("── Boulevard du Rhône – Vienne ──")
    affaire = find_or_create_affaire(
        affaires_rst,
        chantier="Boulevard du Rhône Vienne aménagement",
        client="Vienne Condrieu Agglomération",
        token=token
    )
    if not affaire:
        print("  ↷ Ignorée.")
        return

    payload = {**PASSATION2, "affaire_rst_id": affaire["uid"]}
    result = req("POST", "/api/passations", body=payload, token=token)
    if result:
        print(f"\n  ✓ Passation {result['reference']} → {affaire['reference']} ({affaire.get('chantier','')})")
        print(f"    {len(PASSATION2['documents'])} docs · {len(PASSATION2['actions'])} actions")
    else:
        print("  ✗ Échec création passation")

    print("\n✅ Terminé.")

if __name__ == "__main__":
    main()
