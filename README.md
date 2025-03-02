# TradeSense Bot Backend

A serverless backend for the TradeSense AI-powered crypto trading Telegram bot. This repository contains the API endpoints, serverless functions, and integration services that power the TradeSense bot.

## Architecture

The codebase is organized into clear modules following a service-oriented architecture:

- **Telegram Service**: Handles webhook processing, command parsing, and bot responses
- **AI Service**: Abstracts calls to external AI models (sentiment analysis, price prediction, trading signals)
- **Trading Engine**: Isolates blockchain trading logic (BSC/NEAR adapters) and trade execution functions
- **Database/Cache Layer**: Centralizes interactions with Supabase and caching services

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A Telegram Bot token (from BotFather)
- Supabase account with a project set up
- HuggingFace account for AI model access
- (Optional) Crypto wallet private keys for trading functionality

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/tradesense-bot-backend.git
   cd tradesense-bot-backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env.local` file based on `.env.example`:

   ```bash
   cp .env.example .env.local
   ```

4. Fill in the required environment variables in `.env.local`

### Development

Run the development server:

```bash
npm run dev
```

The server will be available at `http://localhost:3000`.

### Setting Up Telegram Webhook

To set up your bot to receive updates via webhook:

1. Deploy the application to Vercel or your preferred serverless platform
2. Register your webhook URL with Telegram:

   ```bash
   curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook -H "Content-Type: application/json" -d '{"url": "https://your-app-url.vercel.app/api/telegram-webhook", "secret_token": "your-webhook-secret"}'
   ```

3. Verify the webhook is set correctly:

   ```bash
   curl -X GET https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
   ```

## Database Schema

The application uses Supabase with the following tables:

- `users`: Stores Telegram user information
- `trades`: Records trading activity
- `wallet_connections`: Links users to blockchain wallets
- `sentiment_analysis`: Stores cached market sentiment results
- `predictions`: Stores price predictions
- `trade_signals`: Records trading signals

### Telegram-Supabase User Linking

Users are linked between Telegram and Supabase via the Telegram user ID. When a user interacts with the bot for the first time (using the `/start` command), we create a record in the `users` table with their Telegram ID and other available information. This ID is then used as a reference point across all tables that need user context.

## Project Structure

```bash
.
├── pages/
│   └── api/
│       ├── telegram-webhook.ts     # Telegram webhook endpoint
│       └── ...                     # Other API endpoints
├── services/
│   ├── telegram/                   # Telegram bot functionality
│   ├── ai/                         # AI service integrations
│   ├── trading/                    # Blockchain trading logic
│   └── db/                         # Database interactions
├── utils/
│   └── logger/                     # Structured logging
├── types/                          # Shared TypeScript type definitions
└── docs/                           # Documentation
```

### TypeScript Type Management

To maintain consistency across services, we use a dedicated `types` directory for shared type definitions. This includes:

- `types/api.ts` - Definitions for API request/response structures
- `types/models.ts` - Database model type definitions
- `types/services.ts` - Service-specific type definitions

Using these shared types helps ensure consistency between services and provides better type safety across the application.

## Future Enhancements and Modularity

As the project grows, we'll maintain the following modularity principles:

1. **API Modularity** - If API endpoints grow in complexity, we'll introduce a dedicated `controllers` directory to manage request handling logic separately from route definitions.

2. **Service Boundaries** - Each service should have clear boundaries and communicate through well-defined interfaces.

3. **Testing Strategy** - Unit tests should be co-located with the modules they test, following a `__tests__` directory pattern.

4. **Feature Flags** - For experimental features, we'll implement a feature flag system to enable/disable functionality without code changes.

## Deployment

This project is designed to be deployed to Vercel or similar serverless platforms. Simply connect your repository to Vercel and make sure to configure all the environment variables.

## Security Considerations

- All sensitive keys and tokens are stored in environment variables
- Strict authentication and authorization are enforced for user-specific endpoints
- Parameterized queries and Row Level Security (RLS) are used for all database operations

## License

MIT
