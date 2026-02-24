"""
ML Pipeline — two modes:
- First run (locally): backfill with yfinance + train models
- Daily (GitHub Actions): update with Finnhub quotes + retrain
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
        # First run — try yfinance backfill (works locally)
        try:
            print(f'[pipeline] Only {rows} rows — backfilling with yfinance...')
            backfill()
        except ImportError:
            print('[pipeline] yfinance not available — using Finnhub quotes instead')
            fetch_latest()
        except Exception as e:
            print(f'[pipeline] yfinance failed ({e}) — using Finnhub quotes')
            fetch_latest()
    else:
        print(f'[pipeline] DB has {rows} rows — fetching latest via Finnhub...')
        fetch_latest()

    rows_after = get_row_count()
    if rows_after > 100:
        print('[pipeline] Running XGBoost predictions...')
        results = run_predictions()
        print(f'[pipeline] Done. {len(results)} predictions stored.')
    else:
        print(f'[pipeline] Only {rows_after} rows — need at least 100 for ML. Run backfill locally first.')

if __name__ == '__main__':
    main()
