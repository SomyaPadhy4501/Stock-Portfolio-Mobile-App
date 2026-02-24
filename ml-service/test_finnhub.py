"""Quick test to see what Finnhub returns."""
import requests
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except: pass

KEY = os.environ.get('FINNHUB_KEY', 'd6efr21r01qloir6eis0d6efr21r01qloir6eisg')

# Test 1: Quote (this works in your app)
print('=== Test Quote ===')
r = requests.get(f'https://finnhub.io/api/v1/quote?symbol=AAPL&token={KEY}')
print(f'Status: {r.status_code}')
print(f'Body: {r.text[:500]}')

# Test 2: Candles
print('\n=== Test Candles ===')
from datetime import datetime, timedelta
now = int(datetime.now().timestamp())
start = int((datetime.now() - timedelta(days=365)).timestamp())
r2 = requests.get(f'https://finnhub.io/api/v1/stock/candle?symbol=AAPL&resolution=D&from={start}&to={now}&token={KEY}')
print(f'Status: {r2.status_code}')
print(f'Body: {r2.text[:500]}')
