-- ============================================
-- AI Stock Portfolio - PostgreSQL Schema
-- ============================================
-- Run: psql -U postgres -d ai_stock_portfolio -f schema.sql

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================
-- 2. RISK PROFILES TABLE
-- Stores the user's investment risk tolerance
-- Used by the ML microservice to personalize recommendations
-- ============================================
CREATE TABLE risk_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    risk_tolerance       VARCHAR(20) NOT NULL CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
    investment_horizon   VARCHAR(20) NOT NULL CHECK (investment_horizon IN ('short', 'medium', 'long')),
    max_loss_tolerance   DECIMAL(5, 2) DEFAULT 10.00,  -- max % loss user is comfortable with
    preferred_sectors    TEXT[] DEFAULT '{}',            -- e.g., {'tech', 'healthcare', 'energy'}
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. PORTFOLIOS TABLE
-- Each user has one portfolio with a cash balance
-- ============================================
CREATE TABLE portfolios (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cash_balance    DECIMAL(15, 2) NOT NULL DEFAULT 100000.00,  -- start with $100k mock money
    total_value     DECIMAL(15, 2) NOT NULL DEFAULT 100000.00,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 4. HOLDINGS TABLE
-- Current stock positions in a user's portfolio
-- ============================================
CREATE TABLE holdings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id    UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    ticker          VARCHAR(10) NOT NULL,
    company_name    VARCHAR(255),
    quantity        DECIMAL(15, 6) NOT NULL DEFAULT 0,       -- supports fractional shares
    avg_buy_price   DECIMAL(15, 4) NOT NULL,
    current_price   DECIMAL(15, 4),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(portfolio_id, ticker)
);

CREATE INDEX idx_holdings_portfolio ON holdings(portfolio_id);
CREATE INDEX idx_holdings_ticker ON holdings(ticker);

-- ============================================
-- 5. TRANSACTIONS TABLE
-- Full audit trail of all buy/sell actions
-- ============================================
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id    UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    ticker          VARCHAR(10) NOT NULL,
    transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('buy', 'sell')),
    quantity        DECIMAL(15, 6) NOT NULL,
    price_per_share DECIMAL(15, 4) NOT NULL,
    total_amount    DECIMAL(15, 2) NOT NULL,
    executed_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transactions_portfolio ON transactions(portfolio_id);
CREATE INDEX idx_transactions_ticker ON transactions(ticker);
CREATE INDEX idx_transactions_date ON transactions(executed_at DESC);

-- ============================================
-- 6. WATCHLIST TABLE
-- Stocks the user is tracking
-- ============================================
CREATE TABLE watchlist (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker      VARCHAR(10) NOT NULL,
    added_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, ticker)
);

CREATE INDEX idx_watchlist_user ON watchlist(user_id);

-- ============================================
-- 7. AI RECOMMENDATIONS TABLE
-- Stores predictions from the ML microservice
-- ============================================
CREATE TABLE ai_recommendations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker              VARCHAR(10) NOT NULL,
    recommendation      VARCHAR(10) NOT NULL CHECK (recommendation IN ('strong_buy', 'buy', 'hold', 'sell', 'strong_sell')),
    confidence_score    DECIMAL(5, 4) NOT NULL,          -- 0.0000 to 1.0000
    sentiment_score     DECIMAL(5, 4),                   -- -1.0000 to 1.0000
    xgboost_prediction  DECIMAL(5, 4),                   -- probability of upward movement
    ai_explanation      TEXT,                             -- Gemini-generated explanation
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_recommendations_user ON ai_recommendations(user_id);
CREATE INDEX idx_recommendations_date ON ai_recommendations(created_at DESC);

-- ============================================
-- 8. STOCK PRICES CACHE TABLE
-- Caches yfinance data to avoid excessive API calls
-- ============================================
CREATE TABLE stock_prices_cache (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker      VARCHAR(10) NOT NULL,
    open_price  DECIMAL(15, 4),
    high_price  DECIMAL(15, 4),
    low_price   DECIMAL(15, 4),
    close_price DECIMAL(15, 4),
    volume      BIGINT,
    date        DATE NOT NULL,
    fetched_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(ticker, date)
);

CREATE INDEX idx_stock_cache_ticker_date ON stock_prices_cache(ticker, date DESC);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_risk_profiles_updated_at
    BEFORE UPDATE ON risk_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portfolios_updated_at
    BEFORE UPDATE ON portfolios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_holdings_updated_at
    BEFORE UPDATE ON holdings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
