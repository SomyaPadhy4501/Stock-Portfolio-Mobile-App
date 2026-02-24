# StockAI — Deployment (100% Free Forever)

## Architecture
```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Vercel     │    │   Render     │    │   Neon DB    │
│   (free)     │───▶│   (free)     │───▶│   (free)     │
│              │    │              │    │              │
│  Web App     │    │  FastAPI     │    │  PostgreSQL  │
│  Frontend    │    │  (reads DB)  │    │  prices +    │
│              │    │              │    │  predictions │
└──────────────┘    └──────────────┘    └──────────────┘
                                              ▲
                    ┌──────────────┐           │
                    │   GitHub     │───────────┘
                    │   Actions    │
                    │   (free)     │  Daily cron:
                    │              │  fetch data +
                    │  XGBoost ML  │  train models +
                    │  runs here   │  write predictions
                    └──────────────┘
```

## What runs where:
- **Vercel**: Your mobile app as a web page (React Native Web)
- **Render**: Thin API server that reads predictions from Neon DB
- **Neon DB**: PostgreSQL database storing stock prices + ML predictions
- **GitHub Actions**: Daily cron job (Mon-Fri 9PM ET) that fetches
  stock data, trains XGBoost on 1 year of history, writes predictions
  to Neon DB. Uses GitHub's free 2000 min/month (only needs ~150 min)

---

## Step 1: Neon DB (2 min)

1. Go to [neon.tech](https://neon.tech) → Sign up free
2. Create a new project → name it `stockai`
3. Copy the **connection string** from the dashboard:
   ```
   postgresql://username:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```
   Save this — you'll use it in Steps 2 and 3.

---

## Step 2: Push to GitHub (2 min)

```bash
cd ~/Desktop/Mobile\ App
git init
git add .
git commit -m "StockAI - AI stock trading app"
git remote add origin https://github.com/YOUR_USERNAME/stockai.git
git push -u origin main
```

Then set up the GitHub Action secret:
1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `DATABASE_URL`
4. Value: your Neon connection string from Step 1
5. Click **Add secret**

Now trigger the first ML run:
1. Go to **Actions** tab → **Daily ML Pipeline** → **Run workflow**
2. Wait ~5 min — it downloads 1 year of data and trains models
3. Check the logs to confirm "Done. XX predictions stored"

---

## Step 3: Deploy API on Render (3 min)

1. Go to [render.com](https://render.com) → Sign up with GitHub
2. **New** → **Web Service** → Connect your `stockai` repo
3. Settings:
   - **Name**: `stockai-api`
   - **Root Directory**: `ml-service`
   - **Runtime**: `Docker`
   - **Instance Type**: `Free`
4. **Environment Variables**:
   - `DATABASE_URL` = your Neon connection string
   - `PORT` = `8000`
5. Click **Deploy**
6. You get: `https://stockai-api.onrender.com`
7. Test: open `https://stockai-api.onrender.com/health`

---

## Step 4: Update App API URL

Edit `mobile/src/api.js`:
```javascript
export const ML_URL = 'https://stockai-api.onrender.com';
```

Commit and push:
```bash
git add . && git commit -m "set production API URL" && git push
```

---

## Step 5: Deploy Frontend on Vercel (3 min)

```bash
cd ~/Desktop/Mobile\ App/mobile
npm install
npx expo export --platform web

npm install -g vercel
cd dist
vercel --prod
```

You get: `https://stockai.vercel.app`

---

## Done! Total cost: $0 forever

| Service        | What                    | Free Tier                |
|---------------|-------------------------|--------------------------|
| **Neon**       | PostgreSQL database     | 0.5 GB, always free      |
| **GitHub**     | ML cron (XGBoost)       | 2000 min/month           |
| **Render**     | API server (FastAPI)    | 750 hrs/month, free      |
| **Vercel**     | Web frontend            | 100 GB bandwidth, free   |
| **Finnhub**    | Stock data              | 60 calls/min, free       |

---

## For Your Resume

```
StockAI — AI-Powered Stock Trading Simulator
• Live: https://stockai.vercel.app
• Code: https://github.com/somyapadhy/stockai
• Stack: React Native, Python, FastAPI, XGBoost, PostgreSQL, Docker
• Features: Real-time US stock data, ML-powered buy/sell predictions,
  paper trading with $100k virtual cash
• ML Pipeline: XGBoost trained on 18 technical indicators from 1 year
  of historical data, automated daily via GitHub Actions
```

---

## Local Development

```bash
# Start local PostgreSQL
docker compose up -d

# Run ML pipeline locally
cd ml-service
pip install -r requirements.txt
python run_pipeline.py   # backfill + train
python server.py         # start API

# Start mobile app
cd mobile
npm install
npx expo start
```
