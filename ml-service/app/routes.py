from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import traceback

from app.services.stock_data import get_stock_features, get_top_tickers
from app.services.sentiment import analyze_sentiment
from app.services.predictor import predict_movement
from app.services.recommender import generate_recommendations

router = APIRouter()


class HoldingInput(BaseModel):
    ticker: str
    quantity: float


class RiskProfileInput(BaseModel):
    riskTolerance: str  # conservative, moderate, aggressive
    investmentHorizon: str  # short, medium, long
    maxLossTolerance: float = 10.0
    preferredSectors: List[str] = []


class PredictRequest(BaseModel):
    userId: str
    riskProfile: RiskProfileInput
    currentHoldings: List[HoldingInput] = []


@router.post("/predict")
async def predict(req: PredictRequest):
    """
    Main endpoint called by the Node.js backend.
    1. Pick tickers to analyze (user holdings + top market movers)
    2. Fetch stock features from yfinance
    3. Score news sentiment with Gemini
    4. Run XGBoost prediction
    5. Rerank by user risk profile
    6. Return recommendations with AI explanations
    """
    try:
        # 1. Build ticker list: user holdings + popular tickers
        held_tickers = [h.ticker.upper() for h in req.currentHoldings]
        market_tickers = get_top_tickers(req.riskProfile.preferredSectors)
        all_tickers = list(set(held_tickers + market_tickers))[:15]  # cap at 15

        recommendations = []

        for ticker in all_tickers:
            try:
                # 2. Get stock features (price, volume, technicals)
                features = get_stock_features(ticker)
                if features is None:
                    continue

                # 3. Sentiment from Gemini
                sentiment = await analyze_sentiment(ticker)

                # 4. XGBoost prediction
                prediction = predict_movement(ticker, features, sentiment["score"])

                # 5. Build recommendation object
                recommendations.append({
                    "ticker": ticker,
                    "sentimentScore": sentiment["score"],
                    "xgboostPrediction": prediction["probability"],
                    "aiExplanation": sentiment["explanation"],
                    "features": features,
                    "prediction": prediction,
                })

            except Exception as e:
                print(f"[WARN] Skipping {ticker}: {e}")
                continue

        # 6. Rerank by risk profile
        final = generate_recommendations(
            recommendations,
            risk_tolerance=req.riskProfile.riskTolerance,
            horizon=req.riskProfile.investmentHorizon,
            max_loss=req.riskProfile.maxLossTolerance,
            held_tickers=held_tickers,
        )

        return {"recommendations": final}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tickers")
def get_available_tickers():
    """Returns the default list of tickers the service monitors."""
    return {"tickers": get_top_tickers([])}


@router.get("/sentiment/{ticker}")
async def get_sentiment(ticker: str):
    """Get sentiment analysis for a single ticker."""
    result = await analyze_sentiment(ticker.upper())
    return result


@router.get("/features/{ticker}")
def get_features(ticker: str):
    """Get raw stock features for a ticker."""
    features = get_stock_features(ticker.upper())
    if features is None:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")
    return features
