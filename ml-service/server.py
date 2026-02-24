"""
StockAI ML Server — MySQL + XGBoost + FastAPI
Startup: backfill 1yr → train models → store predictions in MySQL
Cron: refresh daily
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from contextlib import asynccontextmanager

from db import wait_for_db, get_row_count, get_latest_date, get_predictions
from fetcher import backfill, fetch_latest, TRACKED
from predictor import run_predictions

scheduler = BackgroundScheduler()


def nightly_job():
    print('\n=== NIGHTLY CRON ===')
    fetch_latest()
    run_predictions()
    print('=== DONE ===\n')


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Wait for MySQL to be ready
    if not wait_for_db():
        print('[ERROR] Cannot connect to MySQL. Is Docker running?')
        yield
        return

    rows = get_row_count()
    if rows < 100:
        print(f'[startup] Only {rows} rows — backfilling 1 year...')
        backfill()
        rows = get_row_count()
        if rows < 100:
            print('[startup] yfinance failed — seeding sample data...')
            from seed_sample_data import main as seed_main
            seed_main()
        print('[startup] Training XGBoost models...')
        run_predictions()
    else:
        print(f'[startup] MySQL has {rows} rows, latest: {get_latest_date()}')
        preds = get_predictions()
        if len(preds) == 0:
            print('[startup] No predictions — running ML...')
            run_predictions()
        else:
            print(f'[startup] {len(preds)} cached predictions ready')

    scheduler.add_job(nightly_job, 'interval', hours=24, id='nightly')
    scheduler.start()
    print('[cron] Nightly refresh scheduled (every 24h)')
    print('[server] Ready! http://localhost:8000/docs')

    yield
    scheduler.shutdown()


app = FastAPI(title='StockAI ML Service', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])


@app.get('/health')
def health():
    return {
        'status': 'ok',
        'database': 'MySQL',
        'rows': get_row_count(),
        'latest': get_latest_date(),
        'tracked': len(TRACKED),
    }


@app.get('/api/insights/my')
def my_insights(symbols: str):
    """ML predictions for portfolio stocks."""
    sym_list = [s.strip().upper() for s in symbols.split(',') if s.strip()]
    cached = get_predictions(sym_list)
    if cached:
        return {'predictions': cached, 'count': len(cached)}
    results = run_predictions(sym_list)
    return {'predictions': results, 'count': len(results)}


@app.get('/api/insights/discover')
def discover_insights():
    """ML predictions for ALL tracked stocks."""
    cached = get_predictions()
    if cached:
        return {'predictions': cached, 'count': len(cached)}
    results = run_predictions()
    return {'predictions': results, 'count': len(results)}


@app.get('/api/insights/{symbol}')
def single_insight(symbol: str):
    """Single stock ML prediction."""
    cached = get_predictions([symbol.upper()])
    if cached:
        return cached[0]
    results = run_predictions([symbol.upper()])
    return results[0] if results else {'error': f'No data for {symbol}'}


@app.get('/api/prices/{symbol}')
def prices(symbol: str, days: int = 60):
    from db import get_price_history
    h = get_price_history(symbol.upper(), days)
    return {'symbol': symbol.upper(), 'count': len(h), 'prices': h}


@app.post('/api/refresh')
def refresh():
    """Force re-fetch + re-train."""
    fetch_latest()
    results = run_predictions()
    return {'refreshed': len(results)}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000, reload=False)
