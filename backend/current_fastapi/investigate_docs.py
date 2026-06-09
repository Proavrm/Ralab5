import os
import sqlite3
import sys

# Add current directory to path if needed for relative imports
sys.path.append(os.getcwd())

from app.core.database import get_db_path

def format_size(size_bytes):
    if size_bytes is None: return "N/A"
    mib = size_bytes / (1024 * 1024)
    return f"{size_bytes} bytes ({mib:.2f} MiB)"

def main():
    try:
        db_path = get_db_path()
        print(f"Opening database: {db_path}")
        
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        query = """
        SELECT id, register_code, sheet_name, title, document_reference 
        FROM qsse_records 
        WHERE register_code = 'FNC' 
          AND sheet_name = 'Registre FNC' 
          AND (title = 'Pente enrobés' OR document_reference LIKE '%Pente enrobés%')
        """
        cursor.execute(query)
        record = cursor.fetchone()
        
        if not record:
            print("No matching record found in qsse_records.")
            return

        record_id = record["id"]
        print(f"Found record ID: {record_id}")
        print(f"Title: {record['title']}, Ref: {record['document_reference']}")

        cursor.execute("""
            SELECT id, original_name, stored_name, file_size, created_at 
            FROM qsse_documents 
            WHERE qsse_record_id = ?
        """, (record_id,))
        documents = cursor.fetchall()
        
        if not documents:
            print("No linked documents found in qsse_documents.")
            return

        print(f"\nFound {len(documents)} linked document(s):")
        
        for doc in documents:
            db_size = doc["file_size"]
            stored_name = doc["stored_name"]
            
            # Use relative path from current_fastapi
            file_path = os.path.join("storage", "qsse", "fnc", str(record_id), stored_name)
            
            disk_size = None
            if os.path.exists(file_path):
                disk_size = os.path.getsize(file_path)
            
            print("-" * 20)
            print(f"Doc ID: {doc['id']}")
            print(f"Original Name: {doc['original_name']}")
            print(f"Stored Name: {stored_name}")
            print(f"Created At: {doc['created_at']}")
            print(f"DB Size:   {format_size(db_size)}")
            print(f"Disk Size: {format_size(disk_size)}")
            print(f"Path searched: {file_path}")
            
            if disk_size is None:
                print("Status: FILE MISSING ON DISK")
            elif db_size == disk_size:
                print("Status: Sizes MATCH")
            else:
                print("Status: Size MISMATCH")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
