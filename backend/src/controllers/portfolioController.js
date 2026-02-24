const { pool } = require('../config/database');
const axios = require('axios');

// GET /api/portfolio
const getPortfolio = async (req, res) => {
  try {
    // Get portfolio
    const portfolioResult = await pool.query(
      'SELECT * FROM portfolios WHERE user_id = $1',
      [req.user.id]
    );
    if (portfolioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }
    const portfolio = portfolioResult.rows[0];

    // Get holdings
    const holdingsResult = await pool.query(
      'SELECT * FROM holdings WHERE portfolio_id = $1 ORDER BY ticker',
      [portfolio.id]
    );

    // Calculate total portfolio value
    const holdingsValue = holdingsResult.rows.reduce((sum, h) => {
      return sum + (parseFloat(h.current_price || h.avg_buy_price) * parseFloat(h.quantity));
    }, 0);

    res.json({
      id: portfolio.id,
      cashBalance: parseFloat(portfolio.cash_balance),
      totalValue: parseFloat(portfolio.cash_balance) + holdingsValue,
      holdings: holdingsResult.rows.map((h) => ({
        id: h.id,
        ticker: h.ticker,
        companyName: h.company_name,
        quantity: parseFloat(h.quantity),
        avgBuyPrice: parseFloat(h.avg_buy_price),
        currentPrice: parseFloat(h.current_price || h.avg_buy_price),
        totalValue: parseFloat(h.current_price || h.avg_buy_price) * parseFloat(h.quantity),
        gainLoss: (parseFloat(h.current_price || h.avg_buy_price) - parseFloat(h.avg_buy_price)) * parseFloat(h.quantity),
      })),
    });
  } catch (error) {
    console.error('Portfolio fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio.' });
  }
};

// POST /api/portfolio/buy
const buyStock = async (req, res) => {
  const client = await pool.connect();
  try {
    const { ticker, quantity, pricePerShare } = req.body;

    if (!ticker || !quantity || !pricePerShare) {
      return res.status(400).json({ error: 'ticker, quantity, and pricePerShare are required.' });
    }

    const totalCost = quantity * pricePerShare;

    await client.query('BEGIN');

    // Get portfolio
    const portfolioResult = await client.query(
      'SELECT * FROM portfolios WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    const portfolio = portfolioResult.rows[0];

    if (parseFloat(portfolio.cash_balance) < totalCost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient cash balance.' });
    }

    // Deduct cash
    await client.query(
      'UPDATE portfolios SET cash_balance = cash_balance - $1 WHERE id = $2',
      [totalCost, portfolio.id]
    );

    // Upsert holding (update avg price if already holding)
    const existingHolding = await client.query(
      'SELECT * FROM holdings WHERE portfolio_id = $1 AND ticker = $2 FOR UPDATE',
      [portfolio.id, ticker.toUpperCase()]
    );

    if (existingHolding.rows.length > 0) {
      const existing = existingHolding.rows[0];
      const existingQty = parseFloat(existing.quantity);
      const existingAvg = parseFloat(existing.avg_buy_price);
      const newAvgPrice = ((existingQty * existingAvg) + (quantity * pricePerShare)) / (existingQty + quantity);

      await client.query(
        `UPDATE holdings SET quantity = quantity + $1, avg_buy_price = $2, current_price = $3
         WHERE portfolio_id = $4 AND ticker = $5`,
        [quantity, newAvgPrice, pricePerShare, portfolio.id, ticker.toUpperCase()]
      );
    } else {
      await client.query(
        `INSERT INTO holdings (portfolio_id, ticker, quantity, avg_buy_price, current_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [portfolio.id, ticker.toUpperCase(), quantity, pricePerShare, pricePerShare]
      );
    }

    // Record transaction
    await client.query(
      `INSERT INTO transactions (portfolio_id, ticker, transaction_type, quantity, price_per_share, total_amount)
       VALUES ($1, $2, 'buy', $3, $4, $5)`,
      [portfolio.id, ticker.toUpperCase(), quantity, pricePerShare, totalCost]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: `Successfully bought ${quantity} shares of ${ticker.toUpperCase()}`,
      transaction: { ticker: ticker.toUpperCase(), quantity, pricePerShare, totalCost },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Buy error:', error);
    res.status(500).json({ error: 'Buy transaction failed.' });
  } finally {
    client.release();
  }
};

// POST /api/portfolio/sell
const sellStock = async (req, res) => {
  const client = await pool.connect();
  try {
    const { ticker, quantity, pricePerShare } = req.body;

    if (!ticker || !quantity || !pricePerShare) {
      return res.status(400).json({ error: 'ticker, quantity, and pricePerShare are required.' });
    }

    const totalProceeds = quantity * pricePerShare;

    await client.query('BEGIN');

    // Get portfolio
    const portfolioResult = await client.query(
      'SELECT * FROM portfolios WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    const portfolio = portfolioResult.rows[0];

    // Check holding
    const holdingResult = await client.query(
      'SELECT * FROM holdings WHERE portfolio_id = $1 AND ticker = $2 FOR UPDATE',
      [portfolio.id, ticker.toUpperCase()]
    );

    if (holdingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `You don't hold any ${ticker.toUpperCase()} shares.` });
    }

    const holding = holdingResult.rows[0];
    if (parseFloat(holding.quantity) < quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Insufficient shares. You hold ${holding.quantity}.` });
    }

    // Add cash
    await client.query(
      'UPDATE portfolios SET cash_balance = cash_balance + $1 WHERE id = $2',
      [totalProceeds, portfolio.id]
    );

    // Update or remove holding
    const remainingQty = parseFloat(holding.quantity) - quantity;
    if (remainingQty <= 0) {
      await client.query(
        'DELETE FROM holdings WHERE portfolio_id = $1 AND ticker = $2',
        [portfolio.id, ticker.toUpperCase()]
      );
    } else {
      await client.query(
        'UPDATE holdings SET quantity = $1, current_price = $2 WHERE portfolio_id = $3 AND ticker = $4',
        [remainingQty, pricePerShare, portfolio.id, ticker.toUpperCase()]
      );
    }

    // Record transaction
    await client.query(
      `INSERT INTO transactions (portfolio_id, ticker, transaction_type, quantity, price_per_share, total_amount)
       VALUES ($1, $2, 'sell', $3, $4, $5)`,
      [portfolio.id, ticker.toUpperCase(), quantity, pricePerShare, totalProceeds]
    );

    await client.query('COMMIT');

    res.status(200).json({
      message: `Successfully sold ${quantity} shares of ${ticker.toUpperCase()}`,
      transaction: { ticker: ticker.toUpperCase(), quantity, pricePerShare, totalProceeds },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sell error:', error);
    res.status(500).json({ error: 'Sell transaction failed.' });
  } finally {
    client.release();
  }
};

// GET /api/portfolio/transactions
const getTransactions = async (req, res) => {
  try {
    const portfolioResult = await pool.query(
      'SELECT id FROM portfolios WHERE user_id = $1',
      [req.user.id]
    );
    if (portfolioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT * FROM transactions
       WHERE portfolio_id = $1
       ORDER BY executed_at DESC
       LIMIT $2 OFFSET $3`,
      [portfolioResult.rows[0].id, parseInt(limit), parseInt(offset)]
    );

    res.json({ transactions: result.rows });
  } catch (error) {
    console.error('Transactions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
};

module.exports = { getPortfolio, buyStock, sellStock, getTransactions };
