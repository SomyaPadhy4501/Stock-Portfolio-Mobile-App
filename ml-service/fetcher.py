"""
Stock price fetcher — uses Finnhub API (works on GitHub Actions, no blocks).
Fetches daily candles and stores in Neon PostgreSQL.
"""

import os
import json
import time
import requests
from datetime import datetime, timedelta
from db import insert_daily_prices, get_row_count

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

FINNHUB_KEY = os.environ.get('FINNHUB_KEY', 'd6efr21r01qloir6eis0d6efr21r01qloir6eisg')
BASE = 'https://finnhub.io/api/v1'

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


def _fetch_candles(symbol, days=365):
    """Fetch daily candles from Finnhub for a symbol."""
    now = int(datetime.now().timestamp())
    start = int((datetime.now() - timedelta(days=days)).timestamp())

    url = f'{BASE}/stock/candle?symbol={symbol}&resolution=D&from={start}&to={now}&token={FINNHUB_KEY}'

    try:
        res = requests.get(url, timeout=10)
        data = res.json()

        if data.get('s') != 'ok' or 't' not in data:
            return []

        rows = []
        for i in range(len(data['t'])):
            date_str = datetime.fromtimestamp(data['t'][i]).strftime('%Y-%m-%d')
            rows.append({
                'symbol': symbol,
                'date': date_str,
                'open': round(data['o'][i], 4),
                'high': round(data['h'][i], 4),
                'low': round(data['l'][i], 4),
                'close': round(data['c'][i], 4),
                'volume': int(data['v'][i]),
            })
        return rows

    except Exception as e:
        print(f'  [{symbol}] error: {e}')
        return []


def fetch_and_store(days=365):
    print(f'[fetcher] Fetching {len(TRACKED)} stocks from Finnhub ({days} days)...')
    total = 0
    failed = []

    for i, sym in enumerate(TRACKED):
        print(f'  ({i+1}/{len(TRACKED)}) {sym}...', end=' ', flush=True)
        rows = _fetch_candles(sym, days)

        if rows:
            inserted = insert_daily_prices(rows)
            total += inserted
            print(f'{len(rows)} days')
        else:
            failed.append(sym)
            print('FAILED')

        # Finnhub free tier: 60 calls/min — wait 1.1 sec between calls
        time.sleep(1.1)

    print(f'[fetcher] Done. {total} rows inserted. DB total: {get_row_count()}')
    if failed:
        print(f'[fetcher] Failed: {", ".join(failed)}')
    return total


def backfill():
    return fetch_and_store(days=365)

def fetch_latest():
    return fetch_and_store(days=7)
