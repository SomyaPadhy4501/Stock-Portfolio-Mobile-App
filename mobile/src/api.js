const API_KEY = 'd6efr21r01qloir6eis0d6efr21r01qloir6eisg';
const BASE = 'https://finnhub.io/api/v1';

// Get ALL US stock symbols (one call, returns thousands)
export async function getAllUSStocks() {
  const res = await fetch(`${BASE}/stock/symbol?exchange=US&token=${API_KEY}`);
  return res.json();
}

// Get real-time quote for a single ticker
export async function getQuote(symbol) {
  const res = await fetch(`${BASE}/quote?symbol=${symbol}&token=${API_KEY}`);
  return res.json();
}

// Search stocks
export async function searchStocks(query) {
  const res = await fetch(`${BASE}/search?q=${query}&token=${API_KEY}`);
  return res.json();
}
