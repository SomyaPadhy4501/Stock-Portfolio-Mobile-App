const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// POST /api/auth/register
const register = async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password, firstName, lastName, riskTolerance, investmentHorizon } = req.body;

    // Check if user exists
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    await client.query('BEGIN');

    // Create user
    const hashedPassword = await bcrypt.hash(password, 12);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name, created_at`,
      [email, hashedPassword, firstName, lastName]
    );
    const user = userResult.rows[0];

    // Create risk profile
    await client.query(
      `INSERT INTO risk_profiles (user_id, risk_tolerance, investment_horizon)
       VALUES ($1, $2, $3)`,
      [user.id, riskTolerance || 'moderate', investmentHorizon || 'medium']
    );

    // Create portfolio with $100k starting balance
    await client.query(
      `INSERT INTO portfolios (user_id) VALUES ($1)`,
      [user.id]
    );

    await client.query('COMMIT');

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed.' });
  } finally {
    client.release();
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
};

// GET /api/auth/me
const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
              rp.risk_tolerance, rp.investment_horizon, rp.max_loss_tolerance, rp.preferred_sectors
       FROM users u
       LEFT JOIN risk_profiles rp ON rp.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      createdAt: row.created_at,
      riskProfile: {
        riskTolerance: row.risk_tolerance,
        investmentHorizon: row.investment_horizon,
        maxLossTolerance: row.max_loss_tolerance,
        preferredSectors: row.preferred_sectors,
      },
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
};

// PUT /api/auth/risk-profile
const updateRiskProfile = async (req, res) => {
  try {
    const { riskTolerance, investmentHorizon, maxLossTolerance, preferredSectors } = req.body;

    const result = await pool.query(
      `UPDATE risk_profiles
       SET risk_tolerance = COALESCE($1, risk_tolerance),
           investment_horizon = COALESCE($2, investment_horizon),
           max_loss_tolerance = COALESCE($3, max_loss_tolerance),
           preferred_sectors = COALESCE($4, preferred_sectors)
       WHERE user_id = $5
       RETURNING *`,
      [riskTolerance, investmentHorizon, maxLossTolerance, preferredSectors, req.user.id]
    );

    res.json({ message: 'Risk profile updated', riskProfile: result.rows[0] });
  } catch (error) {
    console.error('Risk profile update error:', error);
    res.status(500).json({ error: 'Failed to update risk profile.' });
  }
};

module.exports = { register, login, getProfile, updateRiskProfile };
