"""
Seed sample price data when yfinance is unavailable (rate limits, API issues).
Generates 1 year of realistic OHLCV for tracked tickers so ML can train.
Run: python3 seed_sample_data.py
"""

from datetime import datetime, timedelta
import random
from db import get_conn, get_row_count, insert_daily_prices

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

# Approximate base prices for seed data
BASE_PRICES = {
    'AAPL': 180, 'MSFT': 420, 'GOOGL': 175, 'AMZN': 185, 'NVDA': 140,
    'META': 520, 'TSLA': 250, 'JPM': 200, 'V': 280, 'UNH': 550,
    'MA': 480, 'HD': 380, 'PG': 165, 'JNJ': 160, 'COST': 720,
    'ABBV': 180, 'CRM': 280, 'NFLX': 490, 'AMD': 140, 'ORCL': 140,
    'KO': 60, 'PEP': 170, 'DIS': 110, 'INTC': 35, 'BA': 200,
    'GS': 480, 'AMGN': 310, 'CAT': 380, 'IBM': 190,
    'PLTR': 25, 'SOFI': 12, 'RIVN': 15, 'ROKU': 70, 'SNAP': 14,
    'SQ': 70, 'SHOP': 75, 'DKNG': 45, 'MARA': 25, 'COIN': 280,
    'HOOD': 25, 'RBLX': 42, 'CRWD': 380, 'NET': 110,
    'NIO': 5, 'LCID': 3, 'PLUG': 3, 'BB': 3, 'NOK': 4,
    'SPY': 580, 'QQQ': 510,
}


def gen_prices(symbol, days=252):
    """Generate ~1 year of daily OHLCV with random walk."""
    base = BASE_PRICES.get(symbol, 100)
    rows = []
    d = datetime.now().date() - timedelta(days=days)
    close = base
    for _ in range(days):
        if d.weekday() >= 5:  # skip weekends
            d += timedelta(days=1)
            continue
        ret = random.gauss(0.0002, 0.015)
        open_p = close
        close = round(open_p * (1 + ret), 4)
        high = round(max(open_p, close) * (1 + abs(random.gauss(0, 0.005))), 4)
        low = round(min(open_p, close) * (1 - abs(random.gauss(0, 0.005))), 4)
        vol = int(random.uniform(5e6, 50e6))
        rows.append({
            'symbol': symbol,
            'date': d.strftime('%Y-%m-%d'),
            'open': open_p,
            'high': high,
            'low': low,
            'close': close,
            'volume': vol,
        })
        d += timedelta(days=1)
    return rows


def main():
    if get_row_count() > 100:
        print('[seed] DB already has data, skipping.')
        return
    print('[seed] Generating sample data for', len(TRACKED), 'stocks...')
    all_rows = []
    for sym in TRACKED:
        all_rows.extend(gen_prices(sym))
    inserted = insert_daily_prices(all_rows)
    print(f'[seed] Inserted {inserted} rows. Total: {get_row_count()}')


if __name__ == '__main__':
    main()
