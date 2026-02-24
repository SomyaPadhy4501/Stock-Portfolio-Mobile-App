const { pool } = require('../config/database');

// GET /api/watchlist
const getWatchlist = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC',
      [req.user.id]
    );
    res.json({ watchlist: result.rows });
  } catch (error) {
    console.error('Watchlist fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch watchlist.' });
  }
};

// POST /api/watchlist
const addToWatchlist = async (req, res) => {
  try {
    const { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: 'Ticker is required.' });

    const result = await pool.query(
      `INSERT INTO watchlist (user_id, ticker)
       VALUES ($1, $2)
       ON CONFLICT (user_id, ticker) DO NOTHING
       RETURNING *`,
      [req.user.id, ticker.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: `${ticker.toUpperCase()} is already in your watchlist.` });
    }

    res.status(201).json({ message: `${ticker.toUpperCase()} added to watchlist.` });
  } catch (error) {
    console.error('Watchlist add error:', error);
    res.status(500).json({ error: 'Failed to add to watchlist.' });
  }
};

// DELETE /api/watchlist/:ticker
const removeFromWatchlist = async (req, res) => {
  try {
    const { ticker } = req.params;
    await pool.query(
      'DELETE FROM watchlist WHERE user_id = $1 AND ticker = $2',
      [req.user.id, ticker.toUpperCase()]
    );
    res.json({ message: `${ticker.toUpperCase()} removed from watchlist.` });
  } catch (error) {
    console.error('Watchlist remove error:', error);
    res.status(500).json({ error: 'Failed to remove from watchlist.' });
  }
};

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist };
