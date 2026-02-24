"""
Predictor service — uses XGBoost to predict stock movement probability.

Strategy:
- Trains on-the-fly using 6 months of historical data per ticker
- Features: technical indicators + sentiment score
- Target: whether stock goes UP in next 5 trading days
- Caches trained models per ticker to avoid retraining every call
"""

import os
import pickle
import numpy as np
import pandas as pd
import yfinance as yf
import xgboost as xgb
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import accuracy_score
from typing import Dict, Optional

# Cache trained models in memory
_model_cache: Dict[str, xgb.XGBClassifier] = {}
_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(_MODEL_DIR, exist_ok=True)


def _build_training_data(ticker: str) -> Optional[pd.DataFrame]:
    """Build feature matrix from historical data."""
    try:
        stock = yf.Ticker(ticker)
        df = stock.history(period="2y", interval="1d")

        if df.empty or len(df) < 100:
            return None

        df = df.sort_index()
        close = df["Close"]

        # Features
        df["sma5"] = close.rolling(5).mean()
        df["sma20"] = close.rolling(20).mean()
        df["sma50"] = close.rolling(50).mean()

        # RSI
        delta = close.diff()
        gain = delta.where(delta > 0, 0).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / loss.replace(0, np.nan)
        df["rsi"] = 100 - (100 / (1 + rs))

        # MACD
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        df["macd"] = ema12 - ema26
        df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()

        # Bollinger
        bb_mid = close.rolling(20).mean()
        bb_std = close.rolling(20).std()
        df["bb_position"] = (close - (bb_mid - 2 * bb_std)) / (4 * bb_std)

        # Volatility
        df["volatility"] = close.pct_change().rolling(20).std() * np.sqrt(252)

        # Volume ratio
        df["vol_ratio"] = df["Volume"] / df["Volume"].rolling(20).mean()

        # Momentum
        df["pct_1d"] = close.pct_change(1)
        df["pct_5d"] = close.pct_change(5)
        df["pct_20d"] = close.pct_change(20)

        # Relative to MAs
        df["price_vs_sma20"] = close / df["sma20"] - 1
        df["price_vs_sma50"] = close / df["sma50"] - 1

        # Target: does price go UP in next 5 days?
        df["future_return"] = close.shift(-5) / close - 1
        df["target"] = (df["future_return"] > 0).astype(int)

        # Drop NaN rows
        feature_cols = [
            "sma5", "sma20", "sma50", "rsi", "macd", "macd_signal",
            "bb_position", "volatility", "vol_ratio",
            "pct_1d", "pct_5d", "pct_20d",
            "price_vs_sma20", "price_vs_sma50",
        ]

        df = df.dropna(subset=feature_cols + ["target"])
        return df[feature_cols + ["target"]]

    except Exception as e:
        print(f"[predictor] Training data error for {ticker}: {e}")
        return None


def _train_model(ticker: str) -> Optional[xgb.XGBClassifier]:
    """Train an XGBoost classifier for a specific ticker."""
    df = _build_training_data(ticker)
    if df is None or len(df) < 60:
        return None

    feature_cols = [c for c in df.columns if c != "target"]
    X = df[feature_cols].values
    y = df["target"].values

    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
    )

    # Use last 20% as validation
    split = int(len(X) * 0.8)
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    val_acc = accuracy_score(y_val, model.predict(X_val))
    print(f"[predictor] {ticker} model trained — val accuracy: {val_acc:.2%}")

    # Cache
    _model_cache[ticker] = model

    return model


def predict_movement(ticker: str, features: Dict, sentiment_score: float) -> Dict:
    """
    Predict whether a stock moves UP in the next 5 days.
    Combines technical features with sentiment.
    """
    # Get or train model
    model = _model_cache.get(ticker)
    if model is None:
        model = _train_model(ticker)

    if model is None:
        # Fallback: use a simple heuristic
        return _heuristic_prediction(features, sentiment_score)

    # Build feature vector (same order as training)
    try:
        feature_vector = np.array([[
            features.get("sma5", 0),
            features.get("sma20", 0),
            features.get("sma50", 0),
            features.get("rsi", 50),
            features.get("macd", 0),
            features.get("macdSignal", 0),
            features.get("bbPosition", 0.5),
            features.get("volatility", 0.2),
            features.get("volumeRatio", 1.0),
            features.get("pctChange1d", 0),
            features.get("pctChange5d", 0),
            features.get("pctChange20d", 0),
            features.get("priceVsSma20", 0),
            features.get("priceVsSma50", 0),
        ]])

        # Predict probability
        proba = model.predict_proba(feature_vector)[0]
        up_prob = float(proba[1]) if len(proba) > 1 else 0.5

        # Blend with sentiment (30% sentiment weight)
        sentiment_factor = (sentiment_score + 1) / 2  # normalize 0-1
        blended = 0.7 * up_prob + 0.3 * sentiment_factor

        return {
            "probability": round(blended, 4),
            "rawXgboost": round(up_prob, 4),
            "sentimentFactor": round(sentiment_factor, 4),
            "direction": "up" if blended > 0.5 else "down",
            "method": "xgboost",
        }

    except Exception as e:
        print(f"[predictor] Prediction error for {ticker}: {e}")
        return _heuristic_prediction(features, sentiment_score)


def _heuristic_prediction(features: Dict, sentiment_score: float) -> Dict:
    """Simple rules-based fallback when XGBoost can't be trained."""
    score = 0.5

    rsi = features.get("rsi", 50)
    if rsi < 30:
        score += 0.15  # oversold = potential upside
    elif rsi > 70:
        score -= 0.15  # overbought = potential downside

    if features.get("macd", 0) > features.get("macdSignal", 0):
        score += 0.1
    else:
        score -= 0.1

    if features.get("pctChange5d", 0) > 0.02:
        score += 0.05
    elif features.get("pctChange5d", 0) < -0.02:
        score -= 0.05

    # Blend sentiment
    sentiment_factor = (sentiment_score + 1) / 2
    score = 0.7 * score + 0.3 * sentiment_factor
    score = max(0.05, min(0.95, score))

    return {
        "probability": round(score, 4),
        "rawXgboost": None,
        "sentimentFactor": round(sentiment_factor, 4),
        "direction": "up" if score > 0.5 else "down",
        "method": "heuristic",
    }
