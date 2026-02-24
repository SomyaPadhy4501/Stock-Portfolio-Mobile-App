const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
require('dotenv').config();

const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');

const PORT = process.env.PORT || 3000;

async function startServer() {
  const app = express();

  // ============================================
  // Apollo GraphQL Server
  // ============================================
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return {
        message: error.message,
        code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
      };
    },
    introspection: process.env.NODE_ENV !== 'production',
  });

  await apolloServer.start();

  // ============================================
  // Middleware
  // ============================================
  app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' }));
  app.use(morgan('dev'));

  // Health check (REST — useful for Docker/k8s probes)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'ai-stock-portfolio-graphql', timestamp: new Date().toISOString() });
  });

  // ============================================
  // GraphQL endpoint
  // ============================================
  app.use(
    '/graphql',
    cors(),
    express.json(),
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        // Extract JWT from Authorization header
        const authHeader = req.headers.authorization;
        let user = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const token = authHeader.split(' ')[1];
            user = jwt.verify(token, process.env.JWT_SECRET);
          } catch (err) {
            // Token invalid or expired — user stays null
          }
        }

        return { user };
      },
    })
  );

  // 404 fallback
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found. GraphQL is available at /graphql' });
  });

  // ============================================
  // Start
  // ============================================
  app.listen(PORT, () => {
    console.log(`🚀 GraphQL server ready at http://localhost:${PORT}/graphql`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
