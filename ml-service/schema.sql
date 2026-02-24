CREATE TABLE IF NOT EXISTS daily_prices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    open_price DECIMAL(12,4),
    high_price DECIMAL(12,4),
    low_price DECIMAL(12,4),
    close_price DECIMAL(12,4),
    volume BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_symbol_date (symbol, date)
) ENGINE=InnoDB;

CREATE INDEX idx_prices_symbol ON daily_prices(symbol);
CREATE INDEX idx_prices_date ON daily_prices(date DESC);

CREATE TABLE IF NOT EXISTS predictions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    prediction VARCHAR(20) NOT NULL,
    probability DECIMAL(6,4),
    confidence DECIMAL(6,4),
    signals JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pred_symbol_date (symbol, date)
) ENGINE=InnoDB;

CREATE INDEX idx_pred_symbol ON predictions(symbol);
