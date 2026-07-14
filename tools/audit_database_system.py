#!/usr/bin/env python3
"""Full RaLab5 database system audit."""
from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "backend" / "current_fastapi" / "data"

# Import path resolution from app
import sys

sys.path.insert(0, str(ROOT / "backend" / "current_fastapi"))
from app.core.database import (  # noqa: E402
    DATA_DIR,
    get_db_path,
    get_qsse_db_path,
    resolve_default_db_path,
)


@dataclass
class DbReport:
    label: str
    path: Path
    exists: bool = False
    size_mb: float = 0.0
    mtime: str = ""
    ctime: str = ""
    integrity: str = "n/a"
    quick_check: str = "n/a"
    journal_mode: str = ""
    page_count: int = 0
    freelist: int = 0
    fk_violations: list[tuple] = field(default_factory=list)
    tables: list[str] = field(default_factory=list)
    row_counts: dict[str, int] = field(default_factory=dict)
    json_columns: list[tuple[str, str, int, int, int]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def fmt_ts(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")


def audit_db(path: Path, label: str, count_rows: bool = True) -> DbReport:
    rep = DbReport(label=label, path=path)
    if not path.exists():
        rep.notes.append("ficheiro ausente")
        return rep
    rep.exists = True
    st = path.stat()
    rep.size_mb = st.st_size / 1024 / 1024
    rep.mtime = fmt_ts(st.st_mtime)
    rep.ctime = fmt_ts(st.st_ctime)

    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    rep.integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    rep.quick_check = conn.execute("PRAGMA quick_check").fetchone()[0]
    rep.journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    rep.page_count = conn.execute("PRAGMA page_count").fetchone()[0]
    rep.freelist = conn.execute("PRAGMA freelist_count").fetchone()[0]
    conn.execute("PRAGMA foreign_keys = ON")
    rep.fk_violations = [tuple(r) for r in conn.execute("PRAGMA foreign_key_check")]

    rep.tables = [
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]

    if count_rows:
        for t in rep.tables:
            try:
                rep.row_counts[t] = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            except sqlite3.Error:
                rep.row_counts[t] = -1

    # JSON columns
    for t in rep.tables:
        cols = conn.execute(f"PRAGMA table_info({t})").fetchall()
        for _cid, name, *_ in cols:
            if not (name.endswith("_json") or name in ("resultats",)):
                continue
            total = rep.row_counts.get(t, 0)
            if total <= 0:
                continue
            meaningful = invalid = 0
            for (raw,) in conn.execute(f'SELECT "{name}" FROM "{t}"'):
                text = str(raw or "").strip()
                if text in ("", "{}", "[]"):
                    continue
                try:
                    parsed = json.loads(text)
                    if (isinstance(parsed, dict) and parsed) or (isinstance(parsed, list) and parsed):
                        meaningful += 1
                except json.JSONDecodeError:
                    invalid += 1
            if total > 0:
                rep.json_columns.append((t, name, total, meaningful, invalid))

    conn.close()
    return rep


def orphan_probes_main(conn: sqlite3.Connection) -> list[str]:
    issues = []
    checks = [
        ("pmt_essais -> pmt_campaigns", "SELECT COUNT(*) FROM pmt_essais pe LEFT JOIN pmt_campaigns pc ON pc.id=pe.campaign_id WHERE pe.campaign_id IS NOT NULL AND pc.id IS NULL"),
        ("demandes -> affaires_rst", "SELECT COUNT(*) FROM demandes d LEFT JOIN affaires_rst a ON a.id=d.affaire_rst_id WHERE a.id IS NULL"),
        ("interventions -> demandes", "SELECT COUNT(*) FROM interventions i LEFT JOIN demandes d ON d.id=i.demande_id WHERE i.demande_id IS NOT NULL AND d.id IS NULL"),
        ("g3_missions -> demandes", "SELECT COUNT(*) FROM g3_missions g LEFT JOIN demandes d ON d.id=g.demande_id WHERE d.id IS NULL"),
        ("points_terrain -> series", "SELECT COUNT(*) FROM points_terrain p LEFT JOIN series_essais_terrain s ON s.id=p.serie_id WHERE p.serie_id IS NOT NULL AND s.id IS NULL"),
        ("essais -> echantillons", "SELECT COUNT(*) FROM essais e LEFT JOIN echantillons ec ON ec.id=e.echantillon_id WHERE e.echantillon_id IS NOT NULL AND ec.id IS NULL"),
    ]
    for label, sql in checks:
        try:
            n = conn.execute(sql).fetchone()[0]
            if n:
                issues.append(f"{label}: {n} órfãos")
        except sqlite3.Error as exc:
            issues.append(f"{label}: probe failed ({exc})")
    return issues


def list_data_directory() -> list[tuple[str, float, str]]:
    items = []
    if not DATA.exists():
        return items
    for p in sorted(DATA.iterdir(), key=lambda x: x.name.lower()):
        if p.is_file() and (p.suffix == ".db" or ".db." in p.name or p.name.endswith(".db")):
            items.append((p.name, p.stat().st_size / 1024 / 1024, fmt_ts(p.stat().st_mtime)))
    return items


def connection_pattern_audit() -> list[str]:
    """Static code patterns — dual access paths."""
    return [
        "Canonico: connect_db() / get_db_path() - FK ON, WAL, row_factory",
        "Canonico QSSE: connect_qsse_db() / get_qsse_db_path() -> qsse.db separado",
        "Auth: security.db via SecurityRepository / CompetencyRepository (path hardcoded data/)",
        "Referencia NGE: affaires.db + etudes.db (api/affaires, reference_sources_service)",
        "Legacy isolado: demandes.db (DemandesRepository), dst.db (DstRepository)",
        "Risco: varios api/*.py usam sqlite3.connect(get_db_path()) sem PRAGMA foreign_keys",
        "Schema boot: api_main -> ensure_ralab5_schema() no arranque",
        "Resolucao: RALAB5_DB_PATH > RALAB4_DB_PATH > ralab5.db > ralab3.db > criar ralab5.db",
    ]


def main() -> None:
    print("=" * 78)
    print("RaLab5 — AUDITORIA COMPLETA DO SISTEMA DE BASES DE DADOS")
    print("=" * 78)

    # --- Architecture ---
    print("\n## 1. Arquitectura e resolução de paths\n")
    active = get_db_path()
    qsse_active = get_qsse_db_path()
    print(f"DATA_DIR (código):     {DATA_DIR}")
    print(f"DATA_DIR (filesystem): {DATA}")
    print(f"BD principal activa:   {active}  (exists={active.exists()})")
    print(f"BD QSSE activa:        {qsse_active}  (exists={qsse_active.exists()})")
    for env in ("RALAB5_DB_PATH", "RALAB4_DB_PATH", "RALAB5_QSSE_DB_PATH", "RALAB4_QSSE_DB_PATH"):
        val = os.environ.get(env, "")
        print(f"  {env}: {val or '(não definido)'}")

    print("\nPadrões de ligação:")
    for line in connection_pattern_audit():
        print(f"  • {line}")

    # --- File inventory ---
    print("\n## 2. Inventário ficheiros em data/\n")
    print(f"{'Ficheiro':<45} {'MB':>8} {'mtime':>18}")
    print("-" * 73)
    for name, mb, mtime in list_data_directory():
        role = ""
        if name == active.name:
            role = " <- PRINCIPAL"
        elif name == qsse_active.name:
            role = " <- QSSE"
        elif name == "security.db":
            role = " <- AUTH"
        elif name in ("affaires.db", "etudes.db"):
            role = " <- REF"
        elif name in ("demandes.db", "dst.db"):
            role = " <- LEGACY"
        print(f"{name:<45} {mb:>8.2f} {mtime:>18}{role}")

    # --- Per-DB audit ---
    dbs_to_audit = [
        (active, "Principal (RST/Labo/G3/…)"),
        (qsse_active, "QSSE (independente)"),
        (DATA / "security.db", "Security (auth/competências)"),
        (DATA / "affaires.db", "Referência NGE affaires"),
        (DATA / "etudes.db", "Referência études"),
        (DATA / "dst.db", "DST legacy"),
        (DATA / "demandes.db", "Demandes legacy"),
        (DATA / "reference_sync.db", "Reference sync state"),
    ]

    all_reports: list[DbReport] = []
    for path, label in dbs_to_audit:
        all_reports.append(audit_db(path, label))

    print("\n## 3. Integridade por base\n")
    hdr = f"{'Base':<28} {'MB':>6} {'integrity':>10} {'FK viol.':>9} {'tabelas':>8} {'freelist':>9}"
    print(hdr)
    print("-" * len(hdr))
    for r in all_reports:
        if not r.exists:
            print(f"{r.label:<28} {'—':>6} {'MISSING':>10}")
            continue
        fk = len(r.fk_violations)
        print(
            f"{r.label:<28} {r.size_mb:>6.1f} {r.integrity:>10} {fk:>9} {len(r.tables):>8} {r.freelist:>9}"
        )
        if r.freelist and r.page_count:
            pct = 100 * r.freelist / r.page_count
            if pct > 30:
                r.notes.append(f"freelist {pct:.0f}% — candidata a VACUUM")

    # --- Main DB detail ---
    main_rep = all_reports[0]
    if main_rep.exists:
        print("\n## 4. BD principal — tabelas com dados (top 40 por volume)\n")
        sorted_tables = sorted(main_rep.row_counts.items(), key=lambda x: -x[1])
        for t, n in sorted_tables[:40]:
            if n > 0:
                print(f"  {t:<40} {n:>6,}")
        if len(sorted_tables) > 40:
            print(f"  ... +{len(sorted_tables)-40} tabelas")

        print("\n## 5. BD principal — órfãos FK (probes)\n")
        conn = sqlite3.connect(f"file:{active}?mode=ro", uri=True)
        conn.execute("PRAGMA foreign_keys = ON")
        for line in orphan_probes_main(conn):
            print(f"  [!] {line}")
        if not orphan_probes_main(conn):
            print("  (nenhum órfão nos probes standard)")
        conn.close()

        if main_rep.fk_violations:
            print("\n  foreign_key_check (SQLite):")
            for v in main_rep.fk_violations[:15]:
                print(f"    {v}")

        print("\n## 6. JSON na BD principal (colunas *_json / resultats)\n")
        print(f"{'tabela.coluna':<42} {'rows':>6} {'útil':>6} {'inválido':>8}")
        print("-" * 64)
        main_rep.json_columns.sort(key=lambda x: -x[3])
        total_meaningful = 0
        total_invalid = 0
        for t, col, total, meaningful, invalid in main_rep.json_columns:
            if meaningful or invalid:
                print(f"{t}.{col:<30} {total:>6} {meaningful:>6} {invalid:>8}")
                total_meaningful += meaningful
                total_invalid += invalid
        print("-" * 64)
        print(f"TOTAL blobs JSON com conteúdo: {total_meaningful:,} | parse errors: {total_invalid}")

        # observations plain vs json
        print("\n## 7. Colunas observations (JSON vs texto livre)\n")
        conn = sqlite3.connect(f"file:{active}?mode=ro", uri=True)
        for tbl in ["demandes", "interventions", "essais", "feuilles_terrain", "echantillons", "essais_terrain"]:
            cols = {r[1] for r in conn.execute(f"PRAGMA table_info({tbl})")}
            if "observations" not in cols:
                continue
            rows = conn.execute(
                f"SELECT observations FROM {tbl} WHERE TRIM(COALESCE(observations,'')) != ''"
            ).fetchall()
            j = p = 0
            for (raw,) in rows:
                t = str(raw).strip()
                if t.startswith("{") or t.startswith("["):
                    try:
                        json.loads(t)
                        j += 1
                    except json.JSONDecodeError:
                        p += 1
                else:
                    p += 1
            print(f"  {tbl:<22} non-empty={len(rows):>4}  JSON={j:>4}  texto/broken={p:>4}")
        conn.close()

        # QSSE duplication check
        qsse_in_main = set(main_rep.tables) & {
            "qsse_records", "qsse_import_runs", "qsse_rex_drafts", "qsse_documents"
        }
        print("\n## 8. QSSE — duplicação schema\n")
        if qsse_in_main:
            print(f"  Tabelas QSSE também existem na BD principal: {sorted(qsse_in_main)}")
            for t in sorted(qsse_in_main):
                print(f"    {t}: {main_rep.row_counts.get(t, 0)} rows (main) vs qsse.db")
        qsse_rep = all_reports[1]
        if qsse_rep.exists:
            for t in ["qsse_records", "qsse_rex_drafts", "qsse_import_runs"]:
                if t in qsse_rep.row_counts:
                    print(f"    {t}: {qsse_rep.row_counts[t]:,} rows (qsse.db)")

    # --- Security DB ---
    sec = next((r for r in all_reports if r.label.startswith("Security")), None)
    if sec and sec.exists:
        print("\n## 9. security.db\n")
        for t in ["users", "roles", "permissions", "competency_catalog", "user_competency_assessments"]:
            if t in sec.row_counts:
                print(f"  {t}: {sec.row_counts[t]}")

    # --- Reference DBs ---
    print("\n## 10. Bases de referência / legacy\n")
    for r in all_reports[3:]:
        if not r.exists:
            print(f"  {r.label}: ausente")
            continue
        top = sorted(r.row_counts.items(), key=lambda x: -x[1])[:3]
        summary = ", ".join(f"{t}={n}" for t, n in top)
        print(f"  {r.label}: {summary}")

    # --- Issues summary ---
    print("\n## 11. Problemas e recomendações\n")
    issues = []
    if main_rep.exists:
        if main_rep.row_counts.get("pmt_campaigns", 0) == 0 and main_rep.row_counts.get("pmt_essais", 0) > 0:
            issues.append(
                "CRÍTICO: pmt_campaigns vazia mas pmt_essais tem "
                f"{main_rep.row_counts['pmt_essais']} linhas — FK quebrado"
            )
        if main_rep.fk_violations:
            issues.append(f"FK violations SQLite: {len(main_rep.fk_violations)} (ver secção 5)")
        if main_rep.freelist > main_rep.page_count * 0.3:
            issues.append(f"BD principal fragmentada: freelist {main_rep.freelist}/{main_rep.page_count} páginas")
        if not (DATA / "ralab5.db").exists() and active.name == "ralab3.db":
            issues.append("Migração naming: ainda em ralab3.db — ralab5.db não existe (fallback legacy activo)")
    qsse_rep = all_reports[1]
    if qsse_rep.exists and main_rep.exists:
        main_qsse = main_rep.row_counts.get("qsse_records", 0)
        file_qsse = qsse_rep.row_counts.get("qsse_records", 0)
        if main_qsse and file_qsse:
            issues.append(
                f"QSSE duplicado: qsse_records na main ({main_qsse}) E qsse.db ({file_qsse}) — clarificar source of truth"
            )
        elif main_qsse and not file_qsse:
            issues.append("QSSE só na BD principal — qsse.db vazio ou divergente do código qualite.py")
        elif file_qsse and not main_qsse:
            issues.append("QSSE só em qsse.db — schema na main existe mas vazio (OK se intencional)")

    if not issues:
        print("  Nenhum problema crítico além dos já documentados.")
    for i, issue in enumerate(issues, 1):
        print(f"  {i}. {issue}")

    for r in all_reports:
        for n in r.notes:
            print(f"  • [{r.label}] {n}")

    print("\n" + "=" * 78)
    print("Auditoria concluída.")
    print("=" * 78)


if __name__ == "__main__":
    main()
