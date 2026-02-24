"""MySQL database layer for StockAI."""

import mysql.connector
import json

DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'database': 'stockai',
    'user': 'root',
    'password': 'stockai2025',
}


def get_conn():
    return mysql.connector.connect(**DB_CONFIG)


def wait_for_db(retries=30, delay=2):
    """Wait for MySQL to be ready (used on startup)."""
    import time
    for i in range(retries):
        try:
            conn = get_conn()
            conn.close()
            print('[db] MySQL connected')
            return True
        except Exception as e:
            if i < retries - 1:
                print(f'[db] Waiting for MySQL... ({i+1}/{retries})')
                time.sleep(delay)
            else:
                print(f'[db] MySQL not ready after {retries} attempts: {e}')
                return False


def insert_daily_prices(rows):
    conn = get_conn()
    cur = conn.cursor()
    inserted = 0
    for r in rows:
        try:
            cur.execute(
                '''INSERT IGNORE INTO daily_prices (symbol, date, open_price, high_price, low_price, close_price, volume)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)''',
                (r['symbol'], r['date'], r['open'], r['high'], r['low'], r['close'], r['volume'])
            )
            inserted += 1
        except:
            pass
    conn.commit()
    cur.close()
    conn.close()
    return inserted


def get_price_history(symbol, days=252):
    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    cur.execute(
        'SELECT * FROM daily_prices WHERE symbol = %s ORDER BY date DESC LIMIT %s',
        (symbol, days)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    result = []
    for r in reversed(rows):
        result.append({
            'symbol': r['symbol'],
            'date': str(r['date']),
            'open': float(r['open_price'] or 0),
            'high': float(r['high_price'] or 0),
            'low': float(r['low_price'] or 0),
            'close': float(r['close_price'] or 0),
            'volume': int(r['volume'] or 0),
        })
    return result


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
           ON DUPLICATE KEY UPDATE
           prediction = VALUES(prediction), probability = VALUES(probability),
           confidence = VALUES(confidence), signals = VALUES(signals)''',
        (symbol, date, prediction, probability, confidence, signals_json)
    )
    conn.commit()
    cur.close()
    conn.close()


def _get_latest_price(conn, symbol):
    cur = conn.cursor()
    cur.execute(
        'SELECT close_price FROM daily_prices WHERE symbol = %s ORDER BY date DESC LIMIT 1',
        (symbol,)
    )
    row = cur.fetchone()
    cur.close()
    return float(row[0]) if row and row[0] else None


def get_predictions(symbols=None):
    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    if symbols:
        placeholders = ','.join(['%s'] * len(symbols))
        cur.execute(
            f'''SELECT * FROM predictions WHERE symbol IN ({placeholders})
                AND date = (SELECT MAX(date) FROM predictions)
                ORDER BY confidence DESC''',
            tuple(symbols)
        )
    else:
        cur.execute(
            '''SELECT * FROM predictions
               WHERE date = (SELECT MAX(date) FROM predictions)
               ORDER BY confidence DESC'''
        )
    rows = cur.fetchall()
    cur.close()

    result = []
    for r in rows:
        item = dict(r)
        item['date'] = str(item['date'])
        item['probability'] = float(item['probability'] or 0)
        item['confidence'] = float(item['confidence'] or 0)
        price = _get_latest_price(conn, item['symbol'])
        if price is not None:
            item['price'] = round(price, 2)
        if isinstance(item['signals'], str):
            try:
                item['signals'] = json.loads(item['signals'])
            except:
                item['signals'] = []
        result.append(item)
    conn.close()
    return result
