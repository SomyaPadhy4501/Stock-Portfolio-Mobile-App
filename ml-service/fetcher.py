"""
Stock price fetcher — downloads from yfinance, stores in MySQL.
First run: 1 year backfill. Cron: daily update.
"""

import pandas as pd
import yfinance as yf
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

def _fetch_one(sym, period):
    """Fetch single ticker to avoid Yahoo rate limits on batch download."""
    try:
        ticker = yf.Ticker(sym)
        df = ticker.history(period=period, interval='1d', auto_adjust=True)
        if df is None or df.empty:
            return []
        rows = []
        for idx, row in df.iterrows():
            c = row.get('Close', row.get('Close', 0))
            if pd.isna(c) or c <= 0:
                continue
            rows.append({
                'symbol': sym,
                'date': idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx)[:10],
                'open': round(float(row.get('Open', 0) or 0), 4),
                'high': round(float(row.get('High', 0) or 0), 4),
                'low': round(float(row.get('Low', 0) or 0), 4),
                'close': round(float(c), 4),
                'volume': int(row.get('Volume', 0) or 0),
            })
        return rows
    except Exception as e:
        print(f'[fetcher] {sym}: {e}')
        return []


def fetch_and_store(period='1y'):
    import time
    print(f'[fetcher] Downloading {len(TRACKED)} stocks, period={period}...')
    rows = []
    for i, sym in enumerate(TRACKED):
        r = _fetch_one(sym, period)
        rows.extend(r)
        if r:
            print(f'[fetcher] {sym}: {len(r)} rows', end='\r')
        if (i + 1) % 10 == 0:
            time.sleep(1)  # rate limit every 10 tickers

    inserted = insert_daily_prices(rows) if rows else 0
    print(f'[fetcher] Inserted {inserted} rows. Total: {get_row_count()}')
    return inserted

def backfill():
    return fetch_and_store('1y')

def fetch_latest():
    return fetch_and_store('5d')
