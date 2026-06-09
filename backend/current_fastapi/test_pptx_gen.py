import traceback
import asyncio
from api.qualite import _build_fnc_analysis_pptx
from app.core.database import connect_db

async def test_script():
    try:
        year = 2026
        mode = 'codir'
        # Emulating the logic in api/qualite.py
        # Actually, let's see what the fetch query looks like in the endpoint
        query = "SELECT * FROM public.qualite_fnc WHERE date_part('year', date_cloture) = %s"
        
        async with connect_db() as conn:
            # Note: connect_db in app.core.database might return a different type or use different method names
            # api\qualite.py likely uses it. Let's assume fetch exists or adapt if it's a standard asyncpg connection.
            rows = await conn.fetch(query, year)
            print(f"Fetched {len(rows)} rows.")
            
            result = _build_fnc_analysis_pptx(rows, year, mode)
            print("Successfully generated PPTX")
    except Exception:
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(test_script())
