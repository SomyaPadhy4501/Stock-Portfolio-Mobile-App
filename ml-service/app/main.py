"""
StockAI ML Microservice
- Fetches stock data via yfinance
- Scores news sentiment via Gemini
- Stores embeddings in ChromaDB
- Predicts stock movement with XGBoost
- Returns risk-adjusted recommendations
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.routes import router

load_dotenv()

app = FastAPI(
    title="StockAI ML Service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ml-service"}
