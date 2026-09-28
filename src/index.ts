import app from './app';

const PORT = Number(process.env.PORT) || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Startup environment validation
if (NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be configured with at least 32 characters in production.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL is not configured for production environment.');
    process.exit(1);
  }
}

const server = app.listen(PORT, () => {
  console.log(`Job Tracker server running on port ${PORT} [Environment: ${NODE_ENV}]`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`FATAL: Port ${PORT} is already in use. Please configure a different PORT in .env or stop the occupying process.`);
  } else {
    console.error('FATAL: Server error event:', err);
  }
  process.exit(1);
});

// Graceful shutdown handling
function gracefulShutdown(signal: string): void {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  server.close((err) => {
    if (err) {
      console.error('Error during HTTP server close:', err);
      process.exit(1);
    }
    console.log('HTTP server successfully closed. Process exiting.');
    process.exit(0);
  });

  // Force process termination if lingering connections do not close in 10 seconds
  setTimeout(() => {
    console.error('Forceful shutdown triggered after 10-second timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection detected:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception detected:', err);
  process.exit(1);
});

export default server;
