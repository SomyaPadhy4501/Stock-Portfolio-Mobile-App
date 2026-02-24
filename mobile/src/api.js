const FINNHUB_KEY = 'd6efr21r01qloir6eis0d6efr21r01qloir6eisg';
const FINNHUB = 'https://finnhub.io/api/v1';

// ML Service URL — change this after deploying to Railway
// Local: 'http://localhost:8000'
// Railway: 'https://your-app-name.up.railway.app'
export const ML_URL = 'https://stockai-api-vc1z.onrender.com';

export async function getAllUSStocks() {
  const res = await fetch(`${FINNHUB}/stock/symbol?exchange=US&token=${FINNHUB_KEY}`);
  return res.json();
}

export async function getQuote(symbol) {
  const res = await fetch(`${FINNHUB}/quote?symbol=${symbol}&token=${FINNHUB_KEY}`);
  return res.json();
}

export async function searchStocks(query) {
  const res = await fetch(`${FINNHUB}/search?q=${query}&token=${FINNHUB_KEY}`);
  return res.json();
}
