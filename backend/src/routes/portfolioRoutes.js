const express = require('express');
const { getPortfolio, buyStock, sellStock, getTransactions } = require('../controllers/portfolioController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, getPortfolio);
router.post('/buy', authenticate, buyStock);
router.post('/sell', authenticate, sellStock);
router.get('/transactions', authenticate, getTransactions);

module.exports = router;
