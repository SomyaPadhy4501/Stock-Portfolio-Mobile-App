const { pool } = require('../config/database');
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// GET /api/recommendations
// Fetches AI-powered stock recommendations from the Python microservice
const getRecommendations = async (req, res) => {
  try {
    // Get user's risk profile
    const riskResult = await pool.query(
      `SELECT risk_tolerance, investment_horizon, max_loss_tolerance, preferred_sectors
       FROM risk_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (riskResult.rows.length === 0) {
      return res.status(400).json({ error: 'Please complete your risk profile first.' });
    }

    const riskProfile = riskResult.rows[0];

    // Get user's current holdings for context
    const holdingsResult = await pool.query(
      `SELECT h.ticker, h.quantity FROM holdings h
       JOIN portfolios p ON p.id = h.portfolio_id
       WHERE p.user_id = $1`,
      [req.user.id]
    );

    // Call the Python ML microservice
    const mlResponse = await axios.post(`${ML_SERVICE_URL}/api/predict`, {
      userId: req.user.id,
      riskProfile: {
        riskTolerance: riskProfile.risk_tolerance,
        investmentHorizon: riskProfile.investment_horizon,
        maxLossTolerance: parseFloat(riskProfile.max_loss_tolerance),
        preferredSectors: riskProfile.preferred_sectors,
      },
      currentHoldings: holdingsResult.rows.map((h) => ({
        ticker: h.ticker,
        quantity: parseFloat(h.quantity),
      })),
    }, { timeout: 30000 });

    const recommendations = mlResponse.data.recommendations;

    // Store recommendations in DB for history
    for (const rec of recommendations) {
      await pool.query(
        `INSERT INTO ai_recommendations
         (user_id, ticker, recommendation, confidence_score, sentiment_score, xgboost_prediction, ai_explanation)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.user.id, rec.ticker, rec.recommendation, rec.confidenceScore,
         rec.sentimentScore, rec.xgboostPrediction, rec.aiExplanation]
      );
    }

    res.json({ recommendations });
  } catch (error) {
    // If ML service is down, return cached recommendations
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.warn('ML service unavailable, returning cached recommendations');
      const cached = await pool.query(
        `SELECT DISTINCT ON (ticker) ticker, recommendation, confidence_score,
                sentiment_score, xgboost_prediction, ai_explanation, created_at
         FROM ai_recommendations
         WHERE user_id = $1
         ORDER BY ticker, created_at DESC
         LIMIT 10`,
        [req.user.id]
      );

      if (cached.rows.length > 0) {
        return res.json({
          recommendations: cached.rows,
          cached: true,
          message: 'AI service temporarily unavailable. Showing latest cached recommendations.',
        });
      }
    }

    console.error('Recommendations error:', error.message);
    res.status(503).json({ error: 'AI recommendation service temporarily unavailable.' });
  }
};

// GET /api/recommendations/history
const getRecommendationHistory = async (req, res) => {
  try {
    const { ticker, limit = 20 } = req.query;

    let query = `SELECT * FROM ai_recommendations WHERE user_id = $1`;
    const params = [req.user.id];

    if (ticker) {
      query += ` AND ticker = $2`;
      params.push(ticker.toUpperCase());
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ history: result.rows });
  } catch (error) {
    console.error('Recommendation history error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendation history.' });
  }
};

module.exports = { getRecommendations, getRecommendationHistory };
