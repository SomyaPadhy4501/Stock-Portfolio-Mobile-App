const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// ============================================
// Helper: Require authentication
// ============================================
const requireAuth = (context) => {
  if (!context.user) {
    throw new Error('Authentication required. Please provide a valid token.');
  }
  return context.user;
};

const resolvers = {
  // ============================================
  // Custom Scalar: DateTime
  // ============================================
  DateTime: {
    __serialize(value) {
      return value instanceof Date ? value.toISOString() : value;
    },
    __parseValue(value) {
      return new Date(value);
    },
  },

  // ============================================
  // QUERIES
  // ============================================
  Query: {
    // --- Auth ---
    me: async (_, __, context) => {
      const user = requireAuth(context);
      const result = await pool.query(
        'SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1',
        [user.id]
      );
      if (result.rows.length === 0) throw new Error('User not found.');
      const row = result.rows[0];
      return { id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name, createdAt: row.created_at };
    },

    // --- Portfolio ---
    portfolio: async (_, __, context) => {
      const user = requireAuth(context);
      const result = await pool.query('SELECT * FROM portfolios WHERE user_id = $1', [user.id]);
      if (result.rows.length === 0) throw new Error('Portfolio not found.');
      return result.rows[0];
    },

    transactions: async (_, { limit = 50, offset = 0 }, context) => {
      const user = requireAuth(context);
      const portfolioResult = await pool.query('SELECT id FROM portfolios WHERE user_id = $1', [user.id]);
      if (portfolioResult.rows.length === 0) throw new Error('Portfolio not found.');

      const result = await pool.query(
        `SELECT * FROM transactions WHERE portfolio_id = $1 ORDER BY executed_at DESC LIMIT $2 OFFSET $3`,
        [portfolioResult.rows[0].id, limit, offset]
      );
      return result.rows.map(mapTransaction);
    },

    // --- Watchlist ---
    watchlist: async (_, __, context) => {
      const user = requireAuth(context);
      const result = await pool.query(
        'SELECT * FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC',
        [user.id]
      );
      return result.rows.map((r) => ({ id: r.id, ticker: r.ticker, addedAt: r.added_at }));
    },

    // --- AI Recommendations ---
    recommendations: async (_, __, context) => {
      const user = requireAuth(context);

      // Get risk profile
      const riskResult = await pool.query(
        'SELECT * FROM risk_profiles WHERE user_id = $1',
        [user.id]
      );
      if (riskResult.rows.length === 0) throw new Error('Please complete your risk profile first.');
      const rp = riskResult.rows[0];

      // Get current holdings
      const holdingsResult = await pool.query(
        `SELECT h.ticker, h.quantity FROM holdings h
         JOIN portfolios p ON p.id = h.portfolio_id WHERE p.user_id = $1`,
        [user.id]
      );

      try {
        const mlResponse = await axios.post(`${ML_SERVICE_URL}/api/predict`, {
          userId: user.id,
          riskProfile: {
            riskTolerance: rp.risk_tolerance,
            investmentHorizon: rp.investment_horizon,
            maxLossTolerance: parseFloat(rp.max_loss_tolerance),
            preferredSectors: rp.preferred_sectors,
          },
          currentHoldings: holdingsResult.rows.map((h) => ({
            ticker: h.ticker,
            quantity: parseFloat(h.quantity),
          })),
        }, { timeout: 30000 });

        const recs = mlResponse.data.recommendations;

        // Store in DB
        for (const rec of recs) {
          await pool.query(
            `INSERT INTO ai_recommendations
             (user_id, ticker, recommendation, confidence_score, sentiment_score, xgboost_prediction, ai_explanation)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.id, rec.ticker, rec.recommendation, rec.confidenceScore,
             rec.sentimentScore, rec.xgboostPrediction, rec.aiExplanation]
          );
        }

        return { recommendations: recs, cached: false, message: null };
      } catch (error) {
        // Fallback to cached
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          const cached = await pool.query(
            `SELECT DISTINCT ON (ticker) * FROM ai_recommendations
             WHERE user_id = $1 ORDER BY ticker, created_at DESC LIMIT 10`,
            [user.id]
          );
          if (cached.rows.length > 0) {
            return {
              recommendations: cached.rows.map(mapRecommendation),
              cached: true,
              message: 'AI service temporarily unavailable. Showing cached recommendations.',
            };
          }
        }
        throw new Error('AI recommendation service temporarily unavailable.');
      }
    },

    recommendationHistory: async (_, { ticker, limit = 20 }, context) => {
      const user = requireAuth(context);
      let query = 'SELECT * FROM ai_recommendations WHERE user_id = $1';
      const params = [user.id];

      if (ticker) {
        query += ' AND ticker = $2';
        params.push(ticker.toUpperCase());
      }
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await pool.query(query, params);
      return result.rows.map(mapRecommendation);
    },

    // --- Health ---
    health: async () => {
      let dbConnected = false;
      try {
        await pool.query('SELECT 1');
        dbConnected = true;
      } catch (e) { /* db down */ }

      return {
        status: 'ok',
        service: 'ai-stock-portfolio-graphql',
        timestamp: new Date(),
        dbConnected,
      };
    },
  },

  // ============================================
  // MUTATIONS
  // ============================================
  Mutation: {
    // --- Auth ---
    register: async (_, { input }) => {
      const { email, password, firstName, lastName, riskTolerance, investmentHorizon } = input;
      const client = await pool.connect();

      try {
        const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) throw new Error('Email already registered.');

        await client.query('BEGIN');

        const hashedPassword = await bcrypt.hash(password, 12);
        const userResult = await client.query(
          `INSERT INTO users (email, password_hash, first_name, last_name)
           VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name, created_at`,
          [email, hashedPassword, firstName, lastName]
        );
        const user = userResult.rows[0];

        await client.query(
          `INSERT INTO risk_profiles (user_id, risk_tolerance, investment_horizon) VALUES ($1, $2, $3)`,
          [user.id, riskTolerance || 'moderate', investmentHorizon || 'medium']
        );

        await client.query('INSERT INTO portfolios (user_id) VALUES ($1)', [user.id]);

        await client.query('COMMIT');

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
          expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        });

        return {
          token,
          user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, createdAt: user.created_at },
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    login: async (_, { input }) => {
      const { email, password } = input;

      const result = await pool.query(
        'SELECT id, email, password_hash, first_name, last_name FROM users WHERE email = $1',
        [email]
      );
      if (result.rows.length === 0) throw new Error('Invalid email or password.');

      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) throw new Error('Invalid email or password.');

      const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      });

      return {
        token,
        user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name },
      };
    },

    updateRiskProfile: async (_, { input }, context) => {
      const user = requireAuth(context);
      const { riskTolerance, investmentHorizon, maxLossTolerance, preferredSectors } = input;

      const result = await pool.query(
        `UPDATE risk_profiles
         SET risk_tolerance = COALESCE($1, risk_tolerance),
             investment_horizon = COALESCE($2, investment_horizon),
             max_loss_tolerance = COALESCE($3, max_loss_tolerance),
             preferred_sectors = COALESCE($4, preferred_sectors)
         WHERE user_id = $5 RETURNING *`,
        [riskTolerance, investmentHorizon, maxLossTolerance, preferredSectors, user.id]
      );

      const rp = result.rows[0];
      return {
        id: rp.id,
        riskTolerance: rp.risk_tolerance,
        investmentHorizon: rp.investment_horizon,
        maxLossTolerance: parseFloat(rp.max_loss_tolerance),
        preferredSectors: rp.preferred_sectors,
        updatedAt: rp.updated_at,
      };
    },

    // --- Trading ---
    buyStock: async (_, { input }, context) => {
      const user = requireAuth(context);
      const { ticker, quantity, pricePerShare } = input;
      const totalCost = quantity * pricePerShare;
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const portfolioResult = await client.query(
          'SELECT * FROM portfolios WHERE user_id = $1 FOR UPDATE', [user.id]
        );
        const portfolio = portfolioResult.rows[0];

        if (parseFloat(portfolio.cash_balance) < totalCost) {
          throw new Error('Insufficient cash balance.');
        }

        // Deduct cash
        await client.query(
          'UPDATE portfolios SET cash_balance = cash_balance - $1 WHERE id = $2',
          [totalCost, portfolio.id]
        );

        // Upsert holding
        const existing = await client.query(
          'SELECT * FROM holdings WHERE portfolio_id = $1 AND ticker = $2 FOR UPDATE',
          [portfolio.id, ticker.toUpperCase()]
        );

        if (existing.rows.length > 0) {
          const h = existing.rows[0];
          const newAvg = ((parseFloat(h.quantity) * parseFloat(h.avg_buy_price)) + (quantity * pricePerShare))
            / (parseFloat(h.quantity) + quantity);
          await client.query(
            'UPDATE holdings SET quantity = quantity + $1, avg_buy_price = $2, current_price = $3 WHERE portfolio_id = $4 AND ticker = $5',
            [quantity, newAvg, pricePerShare, portfolio.id, ticker.toUpperCase()]
          );
        } else {
          await client.query(
            'INSERT INTO holdings (portfolio_id, ticker, quantity, avg_buy_price, current_price) VALUES ($1, $2, $3, $4, $5)',
            [portfolio.id, ticker.toUpperCase(), quantity, pricePerShare, pricePerShare]
          );
        }

        // Record transaction
        const txResult = await client.query(
          `INSERT INTO transactions (portfolio_id, ticker, transaction_type, quantity, price_per_share, total_amount)
           VALUES ($1, $2, 'buy', $3, $4, $5) RETURNING *`,
          [portfolio.id, ticker.toUpperCase(), quantity, pricePerShare, totalCost]
        );

        await client.query('COMMIT');

        return {
          success: true,
          message: `Bought ${quantity} shares of ${ticker.toUpperCase()}`,
          transaction: mapTransaction(txResult.rows[0]),
          updatedCashBalance: parseFloat(portfolio.cash_balance) - totalCost,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        return { success: false, message: error.message, transaction: null, updatedCashBalance: null };
      } finally {
        client.release();
      }
    },

    sellStock: async (_, { input }, context) => {
      const user = requireAuth(context);
      const { ticker, quantity, pricePerShare } = input;
      const totalProceeds = quantity * pricePerShare;
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const portfolioResult = await client.query(
          'SELECT * FROM portfolios WHERE user_id = $1 FOR UPDATE', [user.id]
        );
        const portfolio = portfolioResult.rows[0];

        const holdingResult = await client.query(
          'SELECT * FROM holdings WHERE portfolio_id = $1 AND ticker = $2 FOR UPDATE',
          [portfolio.id, ticker.toUpperCase()]
        );
        if (holdingResult.rows.length === 0) throw new Error(`You don't hold any ${ticker.toUpperCase()} shares.`);

        const holding = holdingResult.rows[0];
        if (parseFloat(holding.quantity) < quantity) {
          throw new Error(`Insufficient shares. You hold ${holding.quantity}.`);
        }

        // Add cash
        await client.query(
          'UPDATE portfolios SET cash_balance = cash_balance + $1 WHERE id = $2',
          [totalProceeds, portfolio.id]
        );

        // Update or remove holding
        const remaining = parseFloat(holding.quantity) - quantity;
        if (remaining <= 0) {
          await client.query('DELETE FROM holdings WHERE portfolio_id = $1 AND ticker = $2',
            [portfolio.id, ticker.toUpperCase()]);
        } else {
          await client.query(
            'UPDATE holdings SET quantity = $1, current_price = $2 WHERE portfolio_id = $3 AND ticker = $4',
            [remaining, pricePerShare, portfolio.id, ticker.toUpperCase()]
          );
        }

        const txResult = await client.query(
          `INSERT INTO transactions (portfolio_id, ticker, transaction_type, quantity, price_per_share, total_amount)
           VALUES ($1, $2, 'sell', $3, $4, $5) RETURNING *`,
          [portfolio.id, ticker.toUpperCase(), quantity, pricePerShare, totalProceeds]
        );

        await client.query('COMMIT');

        return {
          success: true,
          message: `Sold ${quantity} shares of ${ticker.toUpperCase()}`,
          transaction: mapTransaction(txResult.rows[0]),
          updatedCashBalance: parseFloat(portfolio.cash_balance) + totalProceeds,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        return { success: false, message: error.message, transaction: null, updatedCashBalance: null };
      } finally {
        client.release();
      }
    },

    // --- Watchlist ---
    addToWatchlist: async (_, { ticker }, context) => {
      const user = requireAuth(context);
      const result = await pool.query(
        `INSERT INTO watchlist (user_id, ticker) VALUES ($1, $2)
         ON CONFLICT (user_id, ticker) DO UPDATE SET added_at = NOW()
         RETURNING *`,
        [user.id, ticker.toUpperCase()]
      );
      const r = result.rows[0];
      return { id: r.id, ticker: r.ticker, addedAt: r.added_at };
    },

    removeFromWatchlist: async (_, { ticker }, context) => {
      const user = requireAuth(context);
      const result = await pool.query(
        'DELETE FROM watchlist WHERE user_id = $1 AND ticker = $2',
        [user.id, ticker.toUpperCase()]
      );
      return result.rowCount > 0;
    },
  },

  // ============================================
  // FIELD RESOLVERS (nested queries)
  // ============================================
  User: {
    riskProfile: async (parent) => {
      const result = await pool.query('SELECT * FROM risk_profiles WHERE user_id = $1', [parent.id]);
      if (result.rows.length === 0) return null;
      const rp = result.rows[0];
      return {
        id: rp.id,
        riskTolerance: rp.risk_tolerance,
        investmentHorizon: rp.investment_horizon,
        maxLossTolerance: parseFloat(rp.max_loss_tolerance),
        preferredSectors: rp.preferred_sectors,
        updatedAt: rp.updated_at,
      };
    },
    portfolio: async (parent) => {
      const result = await pool.query('SELECT * FROM portfolios WHERE user_id = $1', [parent.id]);
      return result.rows.length > 0 ? result.rows[0] : null;
    },
    watchlist: async (parent) => {
      const result = await pool.query(
        'SELECT * FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC', [parent.id]
      );
      return result.rows.map((r) => ({ id: r.id, ticker: r.ticker, addedAt: r.added_at }));
    },
  },

  Portfolio: {
    cashBalance: (parent) => parseFloat(parent.cash_balance),
    totalValue: async (parent) => {
      const holdings = await pool.query(
        'SELECT * FROM holdings WHERE portfolio_id = $1', [parent.id]
      );
      const holdingsValue = holdings.rows.reduce((sum, h) => {
        return sum + (parseFloat(h.current_price || h.avg_buy_price) * parseFloat(h.quantity));
      }, 0);
      return parseFloat(parent.cash_balance) + holdingsValue;
    },
    holdings: async (parent) => {
      const result = await pool.query(
        'SELECT * FROM holdings WHERE portfolio_id = $1 ORDER BY ticker', [parent.id]
      );
      return result.rows.map((h) => {
        const qty = parseFloat(h.quantity);
        const avg = parseFloat(h.avg_buy_price);
        const current = parseFloat(h.current_price || h.avg_buy_price);
        return {
          id: h.id,
          ticker: h.ticker,
          companyName: h.company_name,
          quantity: qty,
          avgBuyPrice: avg,
          currentPrice: current,
          totalValue: current * qty,
          gainLoss: (current - avg) * qty,
          gainLossPercent: avg > 0 ? ((current - avg) / avg) * 100 : 0,
        };
      });
    },
    transactions: async (parent, { limit = 50, offset = 0 }) => {
      const result = await pool.query(
        'SELECT * FROM transactions WHERE portfolio_id = $1 ORDER BY executed_at DESC LIMIT $2 OFFSET $3',
        [parent.id, limit, offset]
      );
      return result.rows.map(mapTransaction);
    },
  },
};

// ============================================
// Mapping helpers
// ============================================
function mapTransaction(row) {
  return {
    id: row.id,
    ticker: row.ticker,
    transactionType: row.transaction_type,
    quantity: parseFloat(row.quantity),
    pricePerShare: parseFloat(row.price_per_share),
    totalAmount: parseFloat(row.total_amount),
    executedAt: row.executed_at,
  };
}

function mapRecommendation(row) {
  return {
    id: row.id,
    ticker: row.ticker,
    recommendation: row.recommendation,
    confidenceScore: parseFloat(row.confidence_score),
    sentimentScore: row.sentiment_score ? parseFloat(row.sentiment_score) : null,
    xgboostPrediction: row.xgboost_prediction ? parseFloat(row.xgboost_prediction) : null,
    aiExplanation: row.ai_explanation,
    createdAt: row.created_at,
  };
}

module.exports = resolvers;
