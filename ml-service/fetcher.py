"""
Stock price fetcher — downloads from yfinance one at a time (avoids rate limits on CI).
"""

import yfinance as yf
import time
from db import insert_daily_prices, get_row_count

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


def _fetch_single(symbol, period='1y', retries=3):
    """Fetch one stock with retries."""
    for attempt in range(retries):
        try:
            df = yf.download(symbol, period=period, interval='1d', auto_adjust=True, progress=False)
            if df is not None and not df.empty:
                rows = []
                for idx, row in df.iterrows():
                    rows.append({
                        'symbol': symbol,
                        'date': idx.strftime('%Y-%m-%d'),
                        'open': round(float(row.get('Open', 0)), 4),
                        'high': round(float(row.get('High', 0)), 4),
                        'low': round(float(row.get('Low', 0)), 4),
                        'close': round(float(row.get('Close', 0)), 4),
                        'volume': int(row.get('Volume', 0)),
                    })
                return rows
        except Exception as e:
            print(f'  [{symbol}] attempt {attempt+1} failed: {e}')
            time.sleep(2)
    return []


def fetch_and_store(period='1y'):
    print(f'[fetcher] Fetching {len(TRACKED)} stocks one by one, period={period}...')
    total = 0
    failed = []

    for i, sym in enumerate(TRACKED):
        print(f'  ({i+1}/{len(TRACKED)}) {sym}...', end=' ')
        rows = _fetch_single(sym, period)
        if rows:
            inserted = insert_daily_prices(rows)
            total += inserted
            print(f'{len(rows)} rows')
        else:
            failed.append(sym)
            print('FAILED')
        # Small delay between stocks to avoid rate limiting
        time.sleep(1)

    print(f'[fetcher] Done. Inserted {total} rows. Total in DB: {get_row_count()}')
    if failed:
        print(f'[fetcher] Failed stocks: {", ".join(failed)}')
    return total


def backfill():
    return fetch_and_store('1y')

def fetch_latest():
    return fetch_and_store('5d')
