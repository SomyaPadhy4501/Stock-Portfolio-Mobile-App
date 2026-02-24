"""PostgreSQL database layer — works with Neon DB (free) or local Docker."""

import psycopg2
import psycopg2.extras
import json
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def get_conn():
    url = os.environ.get('DATABASE_URL')
    if url:
        # Parse Neon URL into components — avoids sslmode/channel_binding issues
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(url)
        return psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            dbname=parsed.path.lstrip('/'),
            user=parsed.username,
            password=parsed.password,
            sslmode='require',
        )
    # Local Docker fallback
    return psycopg2.connect(
        host=os.environ.get('DB_HOST', 'localhost'),
        port=int(os.environ.get('DB_PORT', 5432)),
        dbname=os.environ.get('DB_NAME', 'stockai'),
        user=os.environ.get('DB_USER', 'postgres'),
        password=os.environ.get('DB_PASSWORD', 'stockai2025'),
    )

def wait_for_db(retries=15, delay=2):
    import time
    for i in range(retries):
        try:
            conn = get_conn()
            conn.close()
            print('[db] PostgreSQL connected')
            return True
        except Exception as e:
            if i < retries - 1:
                print(f'[db] Waiting for DB... ({i+1}/{retries})')
                time.sleep(delay)
            else:
                print(f'[db] DB not ready: {e}')
                return False

def init_tables():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS daily_prices (
            id SERIAL PRIMARY KEY,
            symbol VARCHAR(10) NOT NULL,
            date DATE NOT NULL,
            open_price DECIMAL(12,4),
            high_price DECIMAL(12,4),
            low_price DECIMAL(12,4),
            close_price DECIMAL(12,4),
            volume BIGINT,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(symbol, date)
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_dp_sym ON daily_prices(symbol)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_dp_date ON daily_prices(date DESC)')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS predictions (
            id SERIAL PRIMARY KEY,
            symbol VARCHAR(10) NOT NULL,
            date DATE NOT NULL,
            prediction VARCHAR(20) NOT NULL,
            probability DECIMAL(6,4),
            confidence DECIMAL(6,4),
            signals JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(symbol, date)
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_pred_sym ON predictions(symbol)')
    conn.commit()
    cur.close()
    conn.close()
    print('[db] Tables ready')

def insert_daily_prices(rows):
    conn = get_conn()
    cur = conn.cursor()
    inserted = 0
    for r in rows:
        try:
            cur.execute(
                '''INSERT INTO daily_prices (symbol, date, open_price, high_price, low_price, close_price, volume)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (symbol, date) DO NOTHING''',
                (r['symbol'], r['date'], r['open'], r['high'], r['low'], r['close'], r['volume'])
            )
            inserted += 1
        except: pass
    conn.commit()
    cur.close()
    conn.close()
    return inserted

def get_price_history(symbol, days=252):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute('SELECT * FROM daily_prices WHERE symbol = %s ORDER BY date DESC LIMIT %s', (symbol, days))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [{'symbol': r['symbol'], 'date': str(r['date']),
             'open': float(r['open_price'] or 0), 'high': float(r['high_price'] or 0),
             'low': float(r['low_price'] or 0), 'close': float(r['close_price'] or 0),
             'volume': int(r['volume'] or 0)} for r in reversed(rows)]

def get_all_symbols():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('SELECT DISTINCT symbol FROM daily_prices ORDER BY symbol')
    symbols = [r[0] for r in cur.fetchall()]
    cur.close()
    conn.close()
    return symbols

def get_latest_date():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('SELECT MAX(date) FROM daily_prices')
    row = cur.fetchone()
    cur.close()
    conn.close()
    return str(row[0]) if row and row[0] else None

def get_row_count():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM daily_prices')
    count = cur.fetchone()[0]
    cur.close()
    conn.close()
    return count

def save_prediction(symbol, date, prediction, probability, confidence, signals):
    conn = get_conn()
    cur = conn.cursor()
    signals_json = json.dumps(signals) if isinstance(signals, (list, dict)) else signals
    cur.execute(
        '''INSERT INTO predictions (symbol, date, prediction, probability, confidence, signals)
           VALUES (%s, %s, %s, %s, %s, %s)
           ON CONFLICT (symbol, date) DO UPDATE
           SET prediction = EXCLUDED.prediction, probability = EXCLUDED.probability,
               confidence = EXCLUDED.confidence, signals = EXCLUDED.signals''',
        (symbol, date, prediction, probability, confidence, signals_json)
    )
    conn.commit()
    cur.close()
    conn.close()

def get_predictions(symbols=None):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if symbols:
        cur.execute(
            '''SELECT * FROM predictions WHERE symbol = ANY(%s)
               AND date = (SELECT MAX(date) FROM predictions)
               ORDER BY confidence DESC''', (symbols,))
    else:
        cur.execute(
            '''SELECT * FROM predictions
               WHERE date = (SELECT MAX(date) FROM predictions)
               ORDER BY confidence DESC''')
    rows = cur.fetchall()
    cur.close()
    conn.close()
    result = []
    for r in rows:
        item = dict(r)
        item['date'] = str(item['date'])
        item['probability'] = float(item['probability'] or 0)
        item['confidence'] = float(item['confidence'] or 0)
        if isinstance(item['signals'], str):
            try: item['signals'] = json.loads(item['signals'])
            except: item['signals'] = []
        result.append(item)
    return result
