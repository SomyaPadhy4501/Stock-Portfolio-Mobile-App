"""
ML Predictor — XGBoost trained on historical data from MySQL.

For each stock:
1. Pull 1 year of daily OHLCV from PostgreSQL
2. Engineer 18 technical features (RSI, MACD, Bollinger, momentum, etc.)
3. Label: does stock go UP in next 5 trading days?
4. Train XGBoost classifier with time-series split
5. Predict latest data point → probability, confidence, recommendation
6. Generate signal explanations from feature values
7. Store prediction back in PostgreSQL
"""

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score
import json
from datetime import datetime
from db import get_price_history, save_prediction, get_all_symbols

_model_cache = {}

FEATURES = [
    'rsi', 'macd', 'macd_signal', 'macd_hist',
    'bb_pct', 'volatility', 'vol_ratio',
    'mom_1d', 'mom_5d', 'mom_10d', 'mom_20d',
    'price_vs_sma20', 'price_vs_sma50',
    'sma5_slope', 'sma20_slope',
    'atr_pct', 'close_to_high', 'close_to_low',
]


def _engineer_features(df):
    """Compute 18 technical indicators from OHLCV."""
    c = df['close']
    h = df['high']
    l = df['low']
    v = df['volume'].astype(float)

    # Moving averages
    df['sma5'] = c.rolling(5).mean()
    df['sma10'] = c.rolling(10).mean()
    df['sma20'] = c.rolling(20).mean()
    df['sma50'] = c.rolling(50).mean()

    # MA slopes (rate of change of MA)
    df['sma5_slope'] = df['sma5'].pct_change(3)
    df['sma20_slope'] = df['sma20'].pct_change(5)

    # RSI (14-period)
    delta = c.diff()
    gain = delta.where(delta > 0, 0).rolling(14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    df['rsi'] = 100 - (100 / (1 + rs))

    # MACD
    ema12 = c.ewm(span=12).mean()
    ema26 = c.ewm(span=26).mean()
    df['macd'] = ema12 - ema26
    df['macd_signal'] = df['macd'].ewm(span=9).mean()
    df['macd_hist'] = df['macd'] - df['macd_signal']

    # Bollinger Bands
    bb_mid = c.rolling(20).mean()
    bb_std = c.rolling(20).std()
    df['bb_upper'] = bb_mid + 2 * bb_std
    df['bb_lower'] = bb_mid - 2 * bb_std
    bb_range = df['bb_upper'] - df['bb_lower']
    df['bb_pct'] = (c - df['bb_lower']) / bb_range.replace(0, np.nan)

    # Volatility (annualized 20-day)
    df['volatility'] = c.pct_change().rolling(20).std() * np.sqrt(252)

    # Volume ratio vs 20-day avg
    vol_avg = v.rolling(20).mean()
    df['vol_ratio'] = v / vol_avg.replace(0, np.nan)

    # Momentum (returns over N days)
    df['mom_1d'] = c.pct_change(1)
    df['mom_5d'] = c.pct_change(5)
    df['mom_10d'] = c.pct_change(10)
    df['mom_20d'] = c.pct_change(20)

    # Price vs MAs
    df['price_vs_sma20'] = c / df['sma20'] - 1
    df['price_vs_sma50'] = c / df['sma50'] - 1

    # ATR as % of price
    tr = pd.concat([h - l, abs(h - c.shift(1)), abs(l - c.shift(1))], axis=1).max(axis=1)
    df['atr_pct'] = tr.rolling(14).mean() / c

    # Close relative to day range
    day_range = h - l
    df['close_to_high'] = (h - c) / day_range.replace(0, np.nan)
    df['close_to_low'] = (c - l) / day_range.replace(0, np.nan)

    return df


def _train_and_predict(symbol):
    """Train XGBoost on PostgreSQL data for one stock, return prediction."""
    history = get_price_history(symbol, days=300)
    if len(history) < 80:
        print(f'  [ml] {symbol}: skipped (only {len(history)} rows)')
        return None

    df = pd.DataFrame(history)
    for col in ['close', 'open', 'high', 'low', 'volume']:
        df[col] = df[col].astype(float)

    df = _engineer_features(df)

    # Target: is price higher 5 days from now?
    df['future_ret'] = df['close'].shift(-5) / df['close'] - 1
    df['target'] = (df['future_ret'] > 0).astype(int)

    df = df.dropna(subset=FEATURES + ['target'])
    if len(df) < 60:
        return None

    X = df[FEATURES].values
    y = df['target'].values

    # Time-based train/test (80/20)
    split = int(len(X) * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        eval_metric='logloss',
        random_state=42,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    _model_cache[symbol] = model

    # Predict on latest row
    latest_X = X[-1:]
    proba = model.predict_proba(latest_X)[0]
    up_prob = float(proba[1]) if len(proba) > 1 else 0.5

    # Confidence = validation accuracy
    val_preds = model.predict(X_test)
    val_acc = accuracy_score(y_test, val_preds)

    # Feature importances for explainability
    importances = dict(zip(FEATURES, model.feature_importances_))

    # Latest feature values for signal generation
    latest_row = df.iloc[-1]
    signals = _build_signals(latest_row, up_prob, val_acc, importances)

    # Map probability → recommendation
    if up_prob >= 0.68 and val_acc >= 0.54:
        rec = 'strong_buy'
    elif up_prob >= 0.56:
        rec = 'buy'
    elif up_prob <= 0.32 and val_acc >= 0.54:
        rec = 'strong_sell'
    elif up_prob <= 0.44:
        rec = 'sell'
    else:
        rec = 'hold'

    return {
        'symbol': symbol,
        'prediction': rec,
        'probability': round(up_prob, 4),
        'confidence': round(val_acc, 4),
        'signals': signals,
        'price': round(float(latest_row['close']), 2),
        'rsi': round(float(latest_row['rsi']), 1) if not np.isnan(latest_row['rsi']) else None,
        'macd': round(float(latest_row['macd']), 4) if not np.isnan(latest_row['macd']) else None,
        'volatility': round(float(latest_row['volatility']), 4) if not np.isnan(latest_row['volatility']) else None,
        'momentum_5d': round(float(latest_row['mom_5d']) * 100, 2) if not np.isnan(latest_row['mom_5d']) else None,
        'momentum_20d': round(float(latest_row['mom_20d']) * 100, 2) if not np.isnan(latest_row['mom_20d']) else None,
    }


def _build_signals(row, up_prob, val_acc, importances):
    """Generate human-readable explanations from ML features."""
    signals = []

    # ML prediction headline
    if up_prob >= 0.65:
        signals.append({'text': f'ML model predicts {up_prob*100:.0f}% probability of 5-day upside', 'type': 'bullish'})
    elif up_prob <= 0.35:
        signals.append({'text': f'ML model predicts {(1-up_prob)*100:.0f}% probability of 5-day downside', 'type': 'bearish'})
    else:
        signals.append({'text': f'ML model is neutral — {up_prob*100:.0f}% up probability', 'type': 'neutral'})

    # Model confidence
    if val_acc >= 0.60:
        signals.append({'text': f'High model confidence: {val_acc*100:.0f}% validation accuracy', 'type': 'bullish'})
    elif val_acc >= 0.54:
        signals.append({'text': f'Moderate model confidence: {val_acc*100:.0f}% accuracy', 'type': 'neutral'})
    else:
        signals.append({'text': f'Low model confidence: {val_acc*100:.0f}% — take with caution', 'type': 'bearish'})

    # RSI
    rsi = row.get('rsi', 50)
    if not np.isnan(rsi):
        if rsi > 75:
            signals.append({'text': f'RSI at {rsi:.0f} — heavily overbought, pullback likely', 'type': 'bearish'})
        elif rsi > 65:
            signals.append({'text': f'RSI at {rsi:.0f} — overbought territory', 'type': 'bearish'})
        elif rsi < 25:
            signals.append({'text': f'RSI at {rsi:.0f} — heavily oversold, bounce likely', 'type': 'bullish'})
        elif rsi < 35:
            signals.append({'text': f'RSI at {rsi:.0f} — oversold, watch for reversal', 'type': 'bullish'})
        elif 45 <= rsi <= 55:
            signals.append({'text': f'RSI at {rsi:.0f} — neutral zone', 'type': 'neutral'})

    # MACD
    macd_h = row.get('macd_hist', 0)
    if not np.isnan(macd_h):
        if macd_h > 0 and row.get('macd', 0) > row.get('macd_signal', 0):
            signals.append({'text': 'MACD bullish crossover — positive momentum building', 'type': 'bullish'})
        elif macd_h < 0 and row.get('macd', 0) < row.get('macd_signal', 0):
            signals.append({'text': 'MACD bearish crossover — momentum fading', 'type': 'bearish'})

    # Bollinger position
    bb = row.get('bb_pct', 0.5)
    if not np.isnan(bb):
        if bb > 0.95:
            signals.append({'text': 'Price touching upper Bollinger Band — extended', 'type': 'bearish'})
        elif bb < 0.05:
            signals.append({'text': 'Price at lower Bollinger Band — potential bounce zone', 'type': 'bullish'})

    # Trend (price vs MA)
    vs_sma20 = row.get('price_vs_sma20', 0)
    vs_sma50 = row.get('price_vs_sma50', 0)
    if not np.isnan(vs_sma20):
        if vs_sma20 > 0.05 and vs_sma50 > 0.05:
            signals.append({'text': 'Strong uptrend — above both 20 and 50-day moving averages', 'type': 'bullish'})
        elif vs_sma20 < -0.05 and vs_sma50 < -0.05:
            signals.append({'text': 'Downtrend — below both 20 and 50-day moving averages', 'type': 'bearish'})

    # Momentum
    mom5 = row.get('mom_5d', 0)
    mom20 = row.get('mom_20d', 0)
    if not np.isnan(mom5):
        if mom5 > 0.05:
            signals.append({'text': f'Strong 5-day momentum: +{mom5*100:.1f}%', 'type': 'bullish'})
        elif mom5 < -0.05:
            signals.append({'text': f'Weak 5-day momentum: {mom5*100:.1f}%', 'type': 'bearish'})

    # Volatility
    vol = row.get('volatility', 0)
    if not np.isnan(vol):
        if vol > 0.6:
            signals.append({'text': f'Very high volatility ({vol*100:.0f}% annualized) — risky', 'type': 'bearish'})
        elif vol > 0.4:
            signals.append({'text': f'Elevated volatility ({vol*100:.0f}% annualized)', 'type': 'neutral'})
        elif vol < 0.15:
            signals.append({'text': f'Low volatility ({vol*100:.0f}%) — stable', 'type': 'bullish'})

    # Volume
    vr = row.get('vol_ratio', 1)
    if not np.isnan(vr):
        if vr > 2.0:
            signals.append({'text': f'Unusual volume ({vr:.1f}x average) — big move possible', 'type': 'neutral'})
        elif vr > 1.5:
            signals.append({'text': f'Above-average volume ({vr:.1f}x) — confirms trend', 'type': 'neutral'})

    # Top feature importance
    top_features = sorted(importances.items(), key=lambda x: x[1], reverse=True)[:3]
    names = {'rsi': 'RSI', 'macd_hist': 'MACD', 'mom_5d': '5-day momentum', 'bb_pct': 'Bollinger position',
             'volatility': 'Volatility', 'vol_ratio': 'Volume', 'price_vs_sma20': 'Trend vs 20MA',
             'mom_20d': '20-day momentum', 'price_vs_sma50': 'Trend vs 50MA', 'atr_pct': 'ATR',
             'macd': 'MACD', 'macd_signal': 'MACD Signal', 'mom_1d': '1-day return',
             'mom_10d': '10-day momentum', 'sma5_slope': 'Short-term trend', 'sma20_slope': 'Medium-term trend',
             'close_to_high': 'Close vs High', 'close_to_low': 'Close vs Low'}
    top_names = [names.get(f[0], f[0]) for f in top_features]
    signals.append({'text': f'Key drivers: {", ".join(top_names)}', 'type': 'neutral'})

    return signals


def run_predictions(symbols=None):
    """Run ML for given symbols or all in DB. Returns list of predictions."""
    if symbols is None:
        symbols = get_all_symbols()

    today = datetime.now().strftime('%Y-%m-%d')
    results = []

    print(f'[ml] Running predictions for {len(symbols)} stocks...')
    for sym in symbols:
        try:
            result = _train_and_predict(sym)
            if result:
                save_prediction(
                    sym, today, result['prediction'],
                    result['probability'], result['confidence'],
                    result['signals']
                )
                results.append(result)
                print(f'  ✓ {sym}: {result["prediction"]} (prob={result["probability"]:.2f}, acc={result["confidence"]:.2f})')
        except Exception as e:
            print(f'  ✗ {sym}: {e}')

    results.sort(key=lambda r: r['confidence'] * abs(r['probability'] - 0.5), reverse=True)
    print(f'[ml] Done. {len(results)} predictions.')
    return results
