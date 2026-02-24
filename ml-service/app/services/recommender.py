"""
Recommender service — takes raw predictions and reranks them by user risk profile.
Outputs final Buy/Sell/Hold recommendations.
"""

from typing import Dict, List


def _compute_confidence(pred: Dict, features: Dict) -> float:
    """
    Compute a confidence score (0-1) based on:
    - How strong the prediction is (away from 0.5)
    - How many signals agree
    - Volume confirmation
    """
    prob = pred.get("probability", 0.5)
    strength = abs(prob - 0.5) * 2  # 0 to 1

    # Signal agreement bonus
    signals = 0
    rsi = features.get("rsi", 50)
    if (prob > 0.5 and rsi < 40) or (prob < 0.5 and rsi > 60):
        signals += 1

    macd = features.get("macd", 0)
    macd_sig = features.get("macdSignal", 0)
    if (prob > 0.5 and macd > macd_sig) or (prob < 0.5 and macd < macd_sig):
        signals += 1

    vol_ratio = features.get("volumeRatio", 1.0)
    if vol_ratio > 1.2:
        signals += 1  # volume confirms movement

    agreement_bonus = signals * 0.1

    confidence = min(1.0, strength + agreement_bonus)
    return round(confidence, 4)


def _map_to_action(probability: float, confidence: float, risk: str) -> str:
    """Map prediction probability to recommendation action."""
    # Risk-adjusted thresholds
    thresholds = {
        "conservative": {"strong_buy": 0.75, "buy": 0.62, "sell": 0.38, "strong_sell": 0.25},
        "moderate": {"strong_buy": 0.70, "buy": 0.58, "sell": 0.42, "strong_sell": 0.30},
        "aggressive": {"strong_buy": 0.65, "buy": 0.55, "sell": 0.45, "strong_sell": 0.35},
    }

    t = thresholds.get(risk, thresholds["moderate"])

    if probability >= t["strong_buy"] and confidence >= 0.5:
        return "strong_buy"
    elif probability >= t["buy"]:
        return "buy"
    elif probability <= t["strong_sell"] and confidence >= 0.5:
        return "strong_sell"
    elif probability <= t["sell"]:
        return "sell"
    else:
        return "hold"


def generate_recommendations(
    raw_predictions: List[Dict],
    risk_tolerance: str,
    horizon: str,
    max_loss: float,
    held_tickers: List[str],
) -> List[Dict]:
    """
    Rerank and filter predictions based on user's risk profile.

    Conservative: fewer recommendations, higher thresholds, prefer low volatility
    Aggressive: more recommendations, lower thresholds, ok with high volatility
    """
    recommendations = []

    for item in raw_predictions:
        features = item.get("features", {})
        prediction = item.get("prediction", {})
        ticker = item["ticker"]

        probability = prediction.get("probability", 0.5)
        confidence = _compute_confidence(prediction, features)

        # Volatility filter for conservative investors
        volatility = features.get("volatility", 0.2)
        if risk_tolerance == "conservative" and volatility > 0.5:
            continue  # skip high-volatility stocks

        # Map to action
        action = _map_to_action(probability, confidence, risk_tolerance)

        # Horizon adjustments
        if horizon == "short" and action == "hold":
            continue  # short-term traders don't want hold signals
        if horizon == "long" and action in ["sell", "strong_sell"] and ticker not in held_tickers:
            continue  # don't suggest selling stocks you don't own for long-term

        # Build final recommendation
        rec = {
            "ticker": ticker,
            "recommendation": action,
            "confidenceScore": confidence,
            "sentimentScore": item.get("sentimentScore", 0),
            "xgboostPrediction": prediction.get("rawXgboost"),
            "aiExplanation": item.get("aiExplanation", ""),
            "currentPrice": features.get("currentPrice"),
            "companyName": features.get("companyName", ticker),
            "sector": features.get("sector", "Unknown"),
        }

        recommendations.append(rec)

    # Sort: strong signals first, then by confidence
    action_priority = {"strong_buy": 0, "strong_sell": 1, "buy": 2, "sell": 3, "hold": 4}
    recommendations.sort(key=lambda r: (
        action_priority.get(r["recommendation"], 5),
        -r["confidenceScore"],
    ))

    # Limit results
    max_recs = {"conservative": 5, "moderate": 8, "aggressive": 12}
    limit = max_recs.get(risk_tolerance, 8)

    return recommendations[:limit]
