import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core.database import connect_qsse_db, ensure_qsse_schema
from app.services.qsse_rex_draft_service import QsseRexDraftService

def smoke_test():
    try:
        print("Ensuring QSSE schema...")
        ensure_qsse_schema()

        print("Connecting to QSSE DB...")
        with connect_qsse_db() as conn:
            row = conn.execute(
                """
                SELECT id, register_code
                FROM qsse_records
                WHERE record_kind = 'event' AND register_code IN ('FNC', 'PASD', 'BP', 'FAE')
                ORDER BY COALESCE(date_event, '') DESC, id DESC
                LIMIT 1
                """
            ).fetchone()

            if not row:
                print("No eligible QSSE event found.")
                return

            record_id = int(row["id"])
            register_code = str(row["register_code"] or "")

        service = QsseRexDraftService()

        print(f"Generating REX draft for record {record_id}...")
        draft = service.generate_for_record(record_id)

        print(f"--- RESULTS ---")
        print(f"Record ID: {record_id}")
        print(f"Register Code: {register_code}")
        print(f"Confidence Score: {draft.get('confidence_score')}")
        print(f"Generated Headline: {(draft.get('draft') or {}).get('headline')}")
        print(f"--- END ---")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    smoke_test()
