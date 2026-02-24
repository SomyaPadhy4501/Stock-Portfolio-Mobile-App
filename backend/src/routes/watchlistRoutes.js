const express = require('express');
const { getWatchlist, addToWatchlist, removeFromWatchlist } = require('../controllers/watchlistController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, getWatchlist);
router.post('/', authenticate, addToWatchlist);
router.delete('/:ticker', authenticate, removeFromWatchlist);

module.exports = router;
