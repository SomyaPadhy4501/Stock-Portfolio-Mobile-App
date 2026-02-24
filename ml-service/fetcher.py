"""
Stock fetcher with two modes:
- backfill(): uses yfinance — run locally on your Mac (one time)
- fetch_latest(): uses Finnhub quotes — works on GitHub Actions (daily)
"""

import os
import time
import requests
from datetime import datetime
from db import insert_daily_prices, get_row_count

try:
    from dotenv import load_dotenv
    load_dotenv()
except: pass

FINNHUB_KEY = os.environ.get('FINNHUB_KEY', 'd6efr21r01qloir6eis0d6efr21r01qloir6eisg')

TRACKED = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
    'JPM', 'V', 'UNH', 'MA', 'HD', 'PG', 'JNJ', 'COST', 'ABBV',
    'CRM', 'NFLX', 'AMD', 'ORCL', 'KO', 'PEP', 'DIS', 'INTC',
    'BA', 'GS', 'AMGN', 'CAT', 'IBM',
    'PLTR', 'SOFI', 'RIVN', 'ROKU', 'SNAP', 'SQ', 'SHOP', 'DKNG',
    'MARA', 'COIN', 'HOOD', 'RBLX', 'CRWD', 'NET',
    'NIO', 'LCID', 'PLUG', 'BB', 'NOK',
    'SPY', 'QQQ',
]


def backfill():
    """One-time backfill using yfinance. Run locally on your Mac."""
    import yfinance as yf

    print(f'[backfill] Downloading 1 year for {len(TRACKED)} stocks via yfinance...')
    total = 0
    failed = []

    for i, sym in enumerate(TRACKED):
        print(f'  ({i+1}/{len(TRACKED)}) {sym}...', end=' ', flush=True)
        try:
            df = yf.download(sym, period='1y', interval='1d', auto_adjust=True, progress=False)
            if df is not None and not df.empty:
                rows = []
                for idx, row in df.iterrows():
                    rows.append({
                        'symbol': sym,
                        'date': idx.strftime('%Y-%m-%d'),
                        'open': round(float(row.get('Open', 0)), 4),
                        'high': round(float(row.get('High', 0)), 4),
                        'low': round(float(row.get('Low', 0)), 4),
                        'close': round(float(row.get('Close', 0)), 4),
                        'volume': int(row.get('Volume', 0)),
                    })
                inserted = insert_daily_prices(rows)
                total += inserted
                print(f'{len(rows)} days')
            else:
                failed.append(sym)
                print('NO DATA')
        except Exception as e:
            failed.append(sym)
            print(f'ERROR: {e}')
        time.sleep(0.5)

    print(f'[backfill] Done. {total} rows. DB total: {get_row_count()}')
    if failed:
        print(f'[backfill] Failed: {", ".join(failed)}')
    return total


def fetch_latest():
    """Daily update using Finnhub quotes. Works on GitHub Actions."""
    print(f'[daily] Fetching latest quotes for {len(TRACKED)} stocks via Finnhub...')
    today = datetime.now().strftime('%Y-%m-%d')
    total = 0
    failed = []

    for i, sym in enumerate(TRACKED):
        print(f'  ({i+1}/{len(TRACKED)}) {sym}...', end=' ', flush=True)
        try:
            r = requests.get(
                f'https://finnhub.io/api/v1/quote?symbol={sym}&token={FINNHUB_KEY}',
                timeout=10
            )
            q = r.json()
            if q and q.get('c', 0) > 0:
                rows = [{
                    'symbol': sym,
                    'date': today,
                    'open': round(q['o'], 4),
                    'high': round(q['h'], 4),
                    'low': round(q['l'], 4),
                    'close': round(q['c'], 4),
                    'volume': 0,  # quote endpoint doesn't return volume
                }]
                inserted = insert_daily_prices(rows)
                total += inserted
                print(f'${q["c"]:.2f}')
            else:
                failed.append(sym)
                print('NO QUOTE')
        except Exception as e:
            failed.append(sym)
            print(f'ERROR: {e}')

        # Finnhub: 60 calls/min
        time.sleep(1.1)

    print(f'[daily] Done. {total} rows. DB total: {get_row_count()}')
    if failed:
        print(f'[daily] Failed: {", ".join(failed)}')
    return total
