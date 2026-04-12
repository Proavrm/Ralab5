import sqlite3
from datetime import datetime

# Caminhos dos bancos de dados
ORIG_DB = 'backend/current_fastapi/data/ralab3.db'
DEST_DB = 'backend/current_fastapi/data/ralab3_structured_candidate_v2.db'

def copy_table(src_conn, dest_conn, table, columns_map, default_values=None):
    src_cur = src_conn.cursor()
    dest_cur = dest_conn.cursor()
    
    src_cols = ', '.join(columns_map.keys())
    dest_cols = ', '.join(columns_map.values())
    
    src_cur.execute(f'SELECT {src_cols} FROM {table}')
    rows = src_cur.fetchall()
    
    for row in rows:
        row_dict = dict(zip(columns_map.values(), row))
        # Preencher valores padrão para colunas novas
        if default_values:
            for k, v in default_values.items():
                row_dict[k] = v
        placeholders = ', '.join(['?'] * len(row_dict))
        dest_cur.execute(f'INSERT INTO {table} ({', '.join(row_dict.keys())}) VALUES ({placeholders})', tuple(row_dict.values()))
    dest_conn.commit()


def main():
    src_conn = sqlite3.connect(ORIG_DB)
    dest_conn = sqlite3.connect(DEST_DB)

    # Exemplo: copiar laboratoires
    copy_table(
        src_conn, dest_conn, 'laboratoires',
        columns_map={
            'id': 'id',
            'code': 'code',
            'nom': 'nom',
            'region': 'region',
            'actif': 'actif',
            'created_at': 'created_at',
        }
    )

    # Exemplo: copiar affaires_rst (adapte para campos novos se necessário)
    copy_table(
        src_conn, dest_conn, 'affaires_rst',
        columns_map={
            'id': 'id',
            'reference': 'reference',
            'annee': 'annee',
            'region': 'region',
            'numero': 'numero',
            'client': 'client',
            'titulaire': 'titulaire',
            'chantier': 'chantier',
            'affaire_nge': 'affaire_nge',
            'date_ouverture': 'date_ouverture',
            'date_cloture': 'date_cloture',
            'statut': 'statut',
            'responsable': 'responsable',
            'source_legacy_id': 'source_legacy_id',
            'created_at': 'created_at',
            'updated_at': 'updated_at',
            # Novos campos:
            # 'site': 'site',
            # 'numero_etude': 'numero_etude',
            # 'filiale': 'filiale',
        },
        default_values={
            'site': '',
            'numero_etude': '',
            'filiale': ''
        }
    )

    # Repita para outras tabelas, adaptando os campos e valores padrão conforme necessário.
    # Para tabelas novas, preencha conforme a lógica do seu sistema.
    # Para campos NOT NULL sem valor antigo, use valores default ou calcule conforme a regra de negócio.

    src_conn.close()
    dest_conn.close()

if __name__ == '__main__':
    main()
