const express = require('express');
const { getRecommendations, getRecommendationHistory } = require('../controllers/recommendationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, getRecommendations);
router.get('/history', authenticate, getRecommendationHistory);

module.exports = router;
