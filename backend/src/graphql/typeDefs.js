const gql = require('graphql-tag');

const typeDefs = gql`
  # ============================================
  # Custom Scalars
  # ============================================
  scalar DateTime

  # ============================================
  # User & Auth Types
  # ============================================
  type User {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    createdAt: DateTime!
    riskProfile: RiskProfile
    portfolio: Portfolio
    watchlist: [WatchlistItem!]!
  }

  type RiskProfile {
    id: ID!
    riskTolerance: RiskTolerance!
    investmentHorizon: InvestmentHorizon!
    maxLossTolerance: Float!
    preferredSectors: [String!]!
    updatedAt: DateTime!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  # ============================================
  # Portfolio Types
  # ============================================
  type Portfolio {
    id: ID!
    cashBalance: Float!
    totalValue: Float!
    holdings: [Holding!]!
    transactions(limit: Int, offset: Int): [Transaction!]!
  }

  type Holding {
    id: ID!
    ticker: String!
    companyName: String
    quantity: Float!
    avgBuyPrice: Float!
    currentPrice: Float!
    totalValue: Float!
    gainLoss: Float!
    gainLossPercent: Float!
  }

  type Transaction {
    id: ID!
    ticker: String!
    transactionType: TransactionType!
    quantity: Float!
    pricePerShare: Float!
    totalAmount: Float!
    executedAt: DateTime!
  }

  type TradeResult {
    success: Boolean!
    message: String!
    transaction: Transaction
    updatedCashBalance: Float
  }

  # ============================================
  # Watchlist Types
  # ============================================
  type WatchlistItem {
    id: ID!
    ticker: String!
    addedAt: DateTime!
  }

  # ============================================
  # AI Recommendation Types
  # ============================================
  type Recommendation {
    id: ID!
    ticker: String!
    recommendation: RecommendationAction!
    confidenceScore: Float!
    sentimentScore: Float
    xgboostPrediction: Float
    aiExplanation: String
    createdAt: DateTime!
  }

  type RecommendationResponse {
    recommendations: [Recommendation!]!
    cached: Boolean!
    message: String
  }

  # ============================================
  # Enums
  # ============================================
  enum RiskTolerance {
    conservative
    moderate
    aggressive
  }

  enum InvestmentHorizon {
    short
    medium
    long
  }

  enum TransactionType {
    buy
    sell
  }

  enum RecommendationAction {
    strong_buy
    buy
    hold
    sell
    strong_sell
  }

  # ============================================
  # Inputs
  # ============================================
  input RegisterInput {
    email: String!
    password: String!
    firstName: String!
    lastName: String!
    riskTolerance: RiskTolerance
    investmentHorizon: InvestmentHorizon
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input RiskProfileInput {
    riskTolerance: RiskTolerance
    investmentHorizon: InvestmentHorizon
    maxLossTolerance: Float
    preferredSectors: [String!]
  }

  input TradeInput {
    ticker: String!
    quantity: Float!
    pricePerShare: Float!
  }

  # ============================================
  # Queries & Mutations
  # ============================================
  type Query {
    # Auth
    me: User!

    # Portfolio
    portfolio: Portfolio!
    transactions(limit: Int, offset: Int): [Transaction!]!

    # Watchlist
    watchlist: [WatchlistItem!]!

    # AI Recommendations
    recommendations: RecommendationResponse!
    recommendationHistory(ticker: String, limit: Int): [Recommendation!]!

    # Health
    health: HealthStatus!
  }

  type Mutation {
    # Auth
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    updateRiskProfile(input: RiskProfileInput!): RiskProfile!

    # Trading
    buyStock(input: TradeInput!): TradeResult!
    sellStock(input: TradeInput!): TradeResult!

    # Watchlist
    addToWatchlist(ticker: String!): WatchlistItem!
    removeFromWatchlist(ticker: String!): Boolean!
  }

  type HealthStatus {
    status: String!
    service: String!
    timestamp: DateTime!
    dbConnected: Boolean!
  }
`;

module.exports = typeDefs;
