"""
Standalone ML pipeline — run by GitHub Actions daily.
1. Connect to Neon DB
2. Fetch latest stock prices via yfinance
3. Train XGBoost models
4. Store predictions in Neon DB
"""

from db import wait_for_db, init_tables, get_row_count
from fetcher import backfill, fetch_latest
from predictor import run_predictions

def main():
    print('=== StockAI ML Pipeline ===')

    if not wait_for_db():
        print('FATAL: Cannot connect to database')
        exit(1)

    init_tables()

    rows = get_row_count()
    if rows < 100:
        print(f'[pipeline] Only {rows} rows — doing full backfill...')
        backfill()
    else:
        print(f'[pipeline] DB has {rows} rows — fetching latest...')
        fetch_latest()

    print('[pipeline] Running XGBoost predictions...')
    results = run_predictions()
    print(f'[pipeline] Done. {len(results)} predictions stored in DB.')

if __name__ == '__main__':
    main()
