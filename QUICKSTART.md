# StockAI Quickstart

## Prerequisites

- **Node.js 18 LTS** (Expo does not support Node 25 yet)
  - Install via [nvm](https://github.com/nvm-sh/nvm): `nvm install 18 && nvm use 18`
  - Or `brew install node@18` and use `export PATH="/opt/homebrew/opt/node@18/bin:$PATH"`
- **Docker** (for MySQL)
- **Python 3.9+** (for ML service)
- **libomp** (macOS only, for XGBoost): `brew install libomp`

---

## Start All Services

### Terminal 1: Databases (MySQL + PostgreSQL)
```bash
cd ~/Desktop/Mobile\ App
docker compose down -v   # clean slate (optional)
docker compose up -d
```
Wait ~10 sec for MySQL and Postgres to boot. MySQL powers the ML service; Postgres powers the GraphQL backend (auth, portfolio).

### Terminal 2: ML Service (MySQL + XGBoost)
```bash
cd ~/Desktop/Mobile\ App/ml-service
python3 -m pip install -r requirements.txt
python3 server.py
```
First run: backfills 1 year of prices via yfinance → trains XGBoost → stores predictions. If yfinance fails (rate limits), it seeds sample data automatically. Once you see `[server] Ready! http://localhost:8000/docs`, the Insights tab will show real ML predictions.

### Terminal 3: GraphQL Backend
```bash
cd ~/Desktop/Mobile\ App/backend
npm install
npm run dev
```

### Terminal 4: Mobile App (uses Node 18)
```bash
cd ~/Desktop/Mobile\ App
./start-mobile.sh
```
Or manually:
```bash
export PATH="/opt/homebrew/opt/node@18/bin:$PATH"
cd ~/Desktop/Mobile\ App/mobile
npx expo start
```

Then:
- **iOS Simulator:** Press `i` (requires Xcode)
- **Android Emulator:** Press `a`
- **Expo Go:** Scan QR code with your phone
- **Web:** Press `w` (or run `npx expo start --web`)

---

## URLs

| Service    | URL                         |
|-----------|-----------------------------|
| GraphQL   | http://localhost:3000/graphql |
| ML Service| http://localhost:8000       |
| Expo Web  | http://localhost:8081       |
