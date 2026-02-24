"""
Sentiment analysis service — uses Gemini to score financial news and ChromaDB to store context.
"""

import os
import json
import google.generativeai as genai
import chromadb
import yfinance as yf
from typing import Dict

# Initialize Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

model = genai.GenerativeModel("gemini-2.0-flash")

# Initialize ChromaDB for storing news + embeddings
chroma_client = chromadb.Client()  # in-memory; use PersistentClient for production
news_collection = chroma_client.get_or_create_collection(
    name="stock_news",
    metadata={"hnsw:space": "cosine"},
)


def _fetch_news(ticker: str) -> list[str]:
    """Pull recent news headlines for a ticker via yfinance."""
    try:
        stock = yf.Ticker(ticker)
        news = stock.news or []

        headlines = []
        for item in news[:10]:
            title = item.get("title", "")
            publisher = item.get("publisher", "")
            if title:
                headlines.append(f"{title} — {publisher}")

        return headlines if headlines else [f"No recent news found for {ticker}."]

    except Exception as e:
        print(f"[sentiment] News fetch error for {ticker}: {e}")
        return [f"Unable to fetch news for {ticker}."]


def _store_in_chromadb(ticker: str, headlines: list[str], sentiment_score: float):
    """Store news headlines in ChromaDB for later RAG-style explanations."""
    try:
        for i, headline in enumerate(headlines[:5]):
            doc_id = f"{ticker}_{i}_{hash(headline) % 10000}"
            news_collection.upsert(
                documents=[headline],
                metadatas=[{"ticker": ticker, "sentiment": sentiment_score}],
                ids=[doc_id],
            )
    except Exception as e:
        print(f"[chromadb] Store error: {e}")


async def analyze_sentiment(ticker: str) -> Dict:
    """
    1. Fetch news headlines for ticker
    2. Send to Gemini for sentiment scoring
    3. Store in ChromaDB
    4. Return score + explanation
    """
    headlines = _fetch_news(ticker)
    headlines_text = "\n".join(f"- {h}" for h in headlines)

    prompt = f"""You are a financial sentiment analyst. Analyze these news headlines for {ticker} and respond ONLY with valid JSON — no markdown, no backticks, no explanation outside the JSON.

Headlines:
{headlines_text}

Return this exact JSON format:
{{"score": <float between -1.0 and 1.0>, "explanation": "<one sentence explaining the market sentiment for {ticker}>"}}

Score guide: -1.0 = extremely bearish, 0.0 = neutral, 1.0 = extremely bullish.
Be precise and base your analysis only on the headlines provided."""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()

        # Clean potential markdown wrapping
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        result = json.loads(text)
        score = max(-1.0, min(1.0, float(result.get("score", 0))))
        explanation = result.get("explanation", f"Sentiment for {ticker} is neutral.")

        # Store in ChromaDB
        _store_in_chromadb(ticker, headlines, score)

        return {
            "ticker": ticker,
            "score": round(score, 4),
            "explanation": explanation,
            "headlineCount": len(headlines),
        }

    except Exception as e:
        print(f"[sentiment] Gemini error for {ticker}: {e}")
        # Fallback: neutral sentiment
        return {
            "ticker": ticker,
            "score": 0.0,
            "explanation": f"Unable to analyze sentiment for {ticker} at this time.",
            "headlineCount": len(headlines),
        }
