"""
StockAI API Server
- Reads predictions from Neon DB (written by GitHub Actions daily)
- Lightweight — no ML training here, just serves data
- Can also trigger ML locally for development
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from db import wait_for_db, init_tables, get_row_count, get_latest_date, get_predictions, get_price_history

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not wait_for_db():
        print('[ERROR] Cannot connect to DB')
        yield
        return
    init_tables()
    print(f'[server] DB: {get_row_count()} rows, latest: {get_latest_date()}')
    preds = get_predictions()
    print(f'[server] {len(preds)} predictions cached')
    yield

app = FastAPI(title='StockAI API', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

@app.get('/health')
def health():
    return {'status': 'ok', 'db': 'Neon PostgreSQL', 'rows': get_row_count(), 'latest': get_latest_date()}

@app.get('/api/insights/my')
def my_insights(symbols: str):
    sym_list = [s.strip().upper() for s in symbols.split(',') if s.strip()]
    cached = get_predictions(sym_list)
    return {'predictions': cached, 'count': len(cached)}

@app.get('/api/insights/discover')
def discover_insights():
    cached = get_predictions()
    return {'predictions': cached, 'count': len(cached)}

@app.get('/api/insights/{symbol}')
def single_insight(symbol: str):
    cached = get_predictions([symbol.upper()])
    return cached[0] if cached else {'error': f'No data for {symbol}'}

@app.get('/api/prices/{symbol}')
def prices(symbol: str, days: int = 60):
    return {'symbol': symbol.upper(), 'prices': get_price_history(symbol.upper(), days)}

# Dev-only: trigger ML locally
@app.post('/api/refresh')
def refresh():
    try:
        from fetcher import fetch_latest
        from predictor import run_predictions
        fetch_latest()
        results = run_predictions()
        return {'refreshed': len(results)}
    except Exception as e:
        return {'error': str(e)}

if __name__ == '__main__':
    import uvicorn
    port = int(os.environ.get('PORT', 8000))
    uvicorn.run(app, host='0.0.0.0', port=port)
