"""
Stock data service — pulls price history and computes technical features using yfinance.
No API key required.
"""

import yfinance as yf
import pandas as pd
import numpy as np
from typing import Optional, Dict, List

# Default tickers by sector
SECTOR_TICKERS = {
    "tech": ["AAPL", "MSFT", "GOOGL", "NVDA", "META", "AMZN"],
    "healthcare": ["JNJ", "UNH", "PFE", "ABBV", "MRK"],
    "energy": ["XOM", "CVX", "COP", "SLB"],
    "finance": ["JPM", "BAC", "GS", "V", "MA"],
    "consumer": ["WMT", "COST", "PG", "KO", "PEP"],
}

DEFAULT_TICKERS = ["AAPL", "MSFT", "GOOGL", "NVDA", "AMZN", "META", "TSLA", "JPM", "V", "UNH"]


def get_top_tickers(preferred_sectors: List[str]) -> List[str]:
    """Return tickers based on preferred sectors, or defaults."""
    if not preferred_sectors:
        return DEFAULT_TICKERS

    tickers = []
    for sector in preferred_sectors:
        sector_key = sector.lower().strip()
        if sector_key in SECTOR_TICKERS:
            tickers.extend(SECTOR_TICKERS[sector_key])

    if not tickers:
        return DEFAULT_TICKERS

    return list(set(tickers))[:12]


def get_stock_features(ticker: str) -> Optional[Dict]:
    """
    Fetch 6 months of daily data and compute features for ML.
    Returns a dict of features or None if data unavailable.
    """
    try:
        stock = yf.Ticker(ticker)
        df = stock.history(period="6mo", interval="1d")

        if df.empty or len(df) < 30:
            return None

        df = df.sort_index()

        # Current price info
        latest = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else latest

        # Technical indicators
        close = df["Close"]

        # Moving averages
        sma_5 = close.rolling(5).mean().iloc[-1]
        sma_20 = close.rolling(20).mean().iloc[-1]
        sma_50 = close.rolling(50).mean().iloc[-1] if len(close) >= 50 else sma_20

        # RSI (14-day)
        delta = close.diff()
        gain = delta.where(delta > 0, 0).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / loss.replace(0, np.nan)
        rsi = (100 - (100 / (1 + rs))).iloc[-1]

        # MACD
        ema_12 = close.ewm(span=12, adjust=False).mean()
        ema_26 = close.ewm(span=26, adjust=False).mean()
        macd = (ema_12 - ema_26).iloc[-1]
        signal = (ema_12 - ema_26).ewm(span=9, adjust=False).mean().iloc[-1]

        # Bollinger Bands
        bb_mid = close.rolling(20).mean().iloc[-1]
        bb_std = close.rolling(20).std().iloc[-1]
        bb_upper = bb_mid + 2 * bb_std
        bb_lower = bb_mid - 2 * bb_std

        # Volatility (20-day)
        returns = close.pct_change().dropna()
        volatility = returns.rolling(20).std().iloc[-1] * np.sqrt(252)  # annualized

        # Volume trend
        vol_avg = df["Volume"].rolling(20).mean().iloc[-1]
        vol_ratio = df["Volume"].iloc[-1] / vol_avg if vol_avg > 0 else 1.0

        # Price changes
        pct_1d = (latest["Close"] - prev["Close"]) / prev["Close"] if prev["Close"] > 0 else 0
        pct_5d = (close.iloc[-1] - close.iloc[-5]) / close.iloc[-5] if len(close) >= 5 else 0
        pct_20d = (close.iloc[-1] - close.iloc[-20]) / close.iloc[-20] if len(close) >= 20 else 0

        # Get basic info
        info = stock.info or {}

        return {
            "ticker": ticker,
            "currentPrice": round(float(latest["Close"]), 2),
            "open": round(float(latest["Open"]), 2),
            "high": round(float(latest["High"]), 2),
            "low": round(float(latest["Low"]), 2),
            "volume": int(latest["Volume"]),
            "companyName": info.get("shortName", ticker),
            "sector": info.get("sector", "Unknown"),
            "marketCap": info.get("marketCap", 0),

            # Technical features for XGBoost
            "sma5": round(float(sma_5), 4),
            "sma20": round(float(sma_20), 4),
            "sma50": round(float(sma_50), 4),
            "rsi": round(float(rsi), 2) if not np.isnan(rsi) else 50.0,
            "macd": round(float(macd), 4),
            "macdSignal": round(float(signal), 4),
            "bbUpper": round(float(bb_upper), 4),
            "bbLower": round(float(bb_lower), 4),
            "volatility": round(float(volatility), 4) if not np.isnan(volatility) else 0.2,
            "volumeRatio": round(float(vol_ratio), 4),

            # Price momentum
            "pctChange1d": round(float(pct_1d), 6),
            "pctChange5d": round(float(pct_5d), 6),
            "pctChange20d": round(float(pct_20d), 6),

            # Relative position
            "priceVsSma20": round(float(latest["Close"] / sma_20 - 1), 6) if sma_20 > 0 else 0,
            "priceVsSma50": round(float(latest["Close"] / sma_50 - 1), 6) if sma_50 > 0 else 0,
            "bbPosition": round(float((latest["Close"] - bb_lower) / (bb_upper - bb_lower)), 4) if (bb_upper - bb_lower) > 0 else 0.5,
        }

    except Exception as e:
        print(f"[stock_data] Error fetching {ticker}: {e}")
        return None
