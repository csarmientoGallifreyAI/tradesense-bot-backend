Enhancing the Next.js Backend with AI Integration and Caching

Introduction

This guide walks through augmenting an existing Next.js backend with AI-powered features and caching, using Hugging Face models and Supabase. The goal is to create a robust AI-driven trading assistant backend that can analyze crypto markets, predict prices, and generate trading signals, while efficiently caching results to minimize redundant calls. We will integrate multiple components: a Hugging Face Inference API for machine learning models, Supabase for caching and data storage, Next.js API routes for organized endpoints, and a Telegram bot interface for user interaction. Throughout the implementation, we will leverage Cursor Composer and Claude 3.7 (AI coding assistants) to automate file creation and updates, ensuring our code adheres to best practices in security, modularity, and scalability.

Key objectives of this enhancement:
• Integrate Hugging Face models for sentiment analysis, price prediction, and trading signal generation via API calls.
• Implement Supabase caching to store AI responses (sentiments, predictions, signals) and reuse recent results.
• Define clear Next.js API routes to handle AI query requests and Telegram webhooks efficiently.
• Improve Telegram bot integration so user commands trigger AI analysis seamlessly and get formatted responses.
• Automate repetitive coding tasks using Cursor Composer & Claude to speed up development.
• Follow best practices for configuration management, error handling, and security (e.g. using environment variables for secrets, verifying webhooks).

By the end of this guide, you will have an AI-enhanced backend that responds quickly to queries (thanks to caching), interacts with a Telegram bot in real-time, and is ready to deploy on Vercel. A high-level overview of the data flow is shown below:

sequenceDiagram
participant User as Telegram User
participant Bot as Telegram Bot (Chat)
participant Webhook as Next.js API (Telegram Webhook)
participant AI as AI Service (HuggingFace API)
participant DB as Supabase DB (Cache)
User->>Bot: Sends command (e.g. /sentiment BTC)
Bot->>Webhook: Forwards update via webhook
Webhook->>AI: aiService.getSentimentAnalysis("BTC")
AI->>DB: Check cache (latest sentiment for BTC)
alt Cache hit
DB-->>AI: Return cached result
else Cache miss/expired
DB-->>AI: No recent cached entry
AI->>HuggingFace: POST sentiment model inference (BTC, timeframe)
HuggingFace-->>AI: Returns sentiment score & sources
AI->>DB: Store new result in cache (Supabase)
end
AI-->>Webhook: Return sentiment analysis result
Webhook-->>Bot: Respond with formatted message (e.g. "BTC sentiment is positive ...")
Bot-->>User: Delivers AI-driven response

Figure: AI request handling flow with caching. The Telegram bot’s command triggers a Next.js API route (webhook) that calls our AI service. The AI service first checks Supabase for a cached result; if not found or expired, it calls the Hugging Face model and then stores the new result. The response is sent back to the user via the Telegram bot. Similar flows apply for price predictions and trading signals.

Prerequisites

Before implementing the steps, ensure the following prerequisites are met:
• Development Environment: Node.js (≥ 18.x) and npm installed. A Next.js 13 project is set up (the existing backend codebase) with TypeScript configured. Verify you can run the development server (npm run dev) without critical errors.
• Hugging Face Account: You have a Hugging Face account with an API Inference Token. Additionally, identify or deploy the models for:
• Sentiment Analysis – model endpoint URL for crypto sentiment (e.g. a model that returns a sentiment score and sources given a token and timeframe).
• Price Prediction – model endpoint URL for predicting token price movement (returns current price, predicted price after a timeframe, percentage change, and confidence).
• Trading Signal – model endpoint URL for generating a buy/sell/hold signal (returns a signal with strength and reasons, and optionally an analysis text).
• Comprehensive Analysis – (optional) a model that combines the above into an overall recommendation.
These model inference URLs typically look like https://api-inference.huggingface.co/models/<username>/<model-name> if using Hugging Face’s hosted API. Have these URLs and your API token ready.
• Supabase Project: A Supabase instance is set up with a database. Obtain the Supabase API URL and Anon Key (for client API) – we will use these in the backend to read/write cached data. Also create the necessary tables in the database:
• users – to store Telegram user info (at least telegram_id, username, etc.).
• wallet_connections – to store user wallet addresses and blockchains.
• sentiment_analysis – to cache sentiment results (token_symbol, sentiment_score, timeframe, sources, created_at).
• predictions – to cache price predictions (token_symbol, current_price, predicted_price, percentage_change, confidence, created_at).
• trade_signals – to cache trading signals (token_symbol, signal, strength, reasons, analysis (optional text), created_at).
You can create these tables via Supabase SQL or the dashboard. Ensure the structure matches the fields our code will insert (as listed above).
• Telegram Bot: A Telegram bot created via @BotFather, with the bot token obtained. Set up a webhook secret token (an arbitrary string) that Telegram will send in the header to verify requests. Keep both the bot token and webhook secret for configuration.
• Environment Configuration: Prepare a local environment file (.env.local for Next.js) with all required secrets and URLs. For example:

# Hugging Face API

HUGGINGFACE_API_TOKEN=<your_hf_api_token>
HUGGINGFACE_SENTIMENT_URL=<sentiment_model_inference_url>
HUGGINGFACE_PRICE_PREDICTION_URL=<price_prediction_model_url>
HUGGINGFACE_TRADING_SIGNAL_URL=<trading_signal_model_url>
HUGGINGFACE_COMPREHENSIVE_ANALYSIS_URL=<comprehensive_model_url>

# Supabase (Anon key for client access)

SUPABASE_URL=<your_supabase_project_url>
SUPABASE_ANON_KEY=<your_supabase_anon_key>

# (Optional) Supabase service role key if needed for admin operations

SUPABASE_SERVICE_ROLE_KEY=<your_supabase_service_role_key>

# Telegram

TELEGRAM_BOT_TOKEN=<your_telegram_bot_token>
TELEGRAM_WEBHOOK_SECRET=<your_webhook_secret_token>

# Blockchain RPC (optional, for trading execution)

BSC_RPC_URL=https://bsc-dataseed.binance.org/ # or your custom BSC RPC endpoint

# (Add any other needed config like NEAR RPC or API keys if required)

Ensure this file is loaded by Next.js (it will be automatically in development). In production (Vercel), these should be added as environment variables in the project settings.

    •	AI Development Tools: Access to Cursor Composer (an AI-enabled IDE) and/or Claude 3.7. These tools will assist in generating boilerplate code and applying repetitive changes. Familiarize yourself with how to prompt these tools to create or edit files in your project. For Cursor, ensure your project is open in the IDE; for Claude, you may use it via a chat interface and copy results into your code.

With all prerequisites in place, we can proceed to implement each feature step by step.

Step-by-Step Implementation

1. Setting up the AI Service (aiService.ts)

First, we’ll create or update the AI service module, which will act as a wrapper for calling Hugging Face models. This service centralizes all interactions with external AI APIs (sentiment analysis, price prediction, trading signal, etc.) and will later include caching logic.

a. Define the AI service structure: In the services/ai/aiService.ts file, we use a class AIService with methods corresponding to each AI capability. The constructor should read configuration from environment variables for the API token and model URLs. For example:

class AIService {
private huggingfaceToken: string;
private sentimentModelUrl: string;
private pricePredictionModelUrl: string;
private tradingSignalModelUrl: string;
private comprehensiveAnalysisModelUrl: string;

constructor() {
this.huggingfaceToken = process.env.HUGGINGFACE_API_TOKEN || '';
this.sentimentModelUrl = process.env.HUGGINGFACE_SENTIMENT_URL || '';
this.pricePredictionModelUrl = process.env.HUGGINGFACE_PRICE_PREDICTION_URL || '';
this.tradingSignalModelUrl = process.env.HUGGINGFACE_TRADING_SIGNAL_URL || '';
this.comprehensiveAnalysisModelUrl = process.env.HUGGINGFACE_COMPREHENSIVE_ANALYSIS_URL || '';

    if (!this.huggingfaceToken) {
      // Log a warning if token is missing
      aiLogger.warn('HUGGINGFACE_API_TOKEN not configured. AI service will not function properly.');
    }
    // ... similar warnings for each model URL if missing ...

}

// ... define methods for each AI task ...
}

This ensures if any required config is missing, a warning is logged (using a logger like Pino). The aiLogger here is a child logger instance (e.g., logger.child({ service: 'ai-service' })) to namespace AI service logs.

b. Implement the sentiment analysis method: The getSentimentAnalysis(tokenSymbol, timeframe) method will call the Hugging Face sentiment model via an HTTP request. We use axios.post to send the request with proper headers (including the Bearer token for authentication). For example:

async getSentimentAnalysis(tokenSymbol: string, timeframe: '1h' | '24h' | '7d' = '24h', forceRefresh = false): Promise<SentimentAnalysisResponse> {
const start = Date.now();
tokenSymbol = tokenSymbol.toUpperCase();
aiLogger.info('Getting sentiment analysis', { tokenSymbol, timeframe, forceRefresh });

// (Caching logic will be inserted here in step 2)

// Ensure model URL is configured
if (!this.sentimentModelUrl) {
throw new Error('Sentiment analysis model URL not configured');
}
// Make API request to Hugging Face model
const response = await axios.post(
this.sentimentModelUrl,
{ inputs: { token: tokenSymbol, timeframe } }, // payload format expected by the model
{
headers: { Authorization: `Bearer ${this.huggingfaceToken}` },
timeout: 15000, // e.g. 15s timeout for the request
}
);
// Validate response structure
if (!response.data || typeof response.data.score !== 'number' || !Array.isArray(response.data.sources)) {
throw new Error('Invalid response structure from sentiment model');
}
const result: SentimentAnalysisResponse = {
score: response.data.score,
sources: response.data.sources || [],
cached: false,
timestamp: new Date().toISOString()
};
aiLogger.info('Sentiment analysis completed', {
tokenSymbol, timeframe, score: result.score, sourceCount: result.sources.length, durationMs: Date.now() - start
});
// (Caching store will be done in step 2)
return result;
}

In this snippet, we construct the POST body as { inputs: { token, timeframe } } – your model on Hugging Face should be set up to accept this JSON input and return an object with a numeric score and an array of sources. Adjust the payload or response handling as needed for your specific model. We also capture a timestamp and mark the result as not cached (cached: false initially – this will be updated if we return a cached result). Similar structure is repeated for other methods.

c. Implement price prediction and trading signal methods: Add getPricePrediction(tokenSymbol, timeHorizon) and getTradingSignal(tokenSymbol, includeAnalysis) methods in a similar fashion. These will call their respective model URLs.
• Price Prediction: This might take a timeframe or horizon (like 1h, 24h, 7d) similar to sentiment. In our code, we default to '24h'. The model is expected to return an object with fields such as currentPrice, predictedPrice, percentageChange, and confidence (all numbers). For example:

async getPricePrediction(tokenSymbol: string, timeHorizon: '1h' | '24h' | '7d' = '24h'): Promise<PricePredictionResponse> {
tokenSymbol = tokenSymbol.toUpperCase();
if (!this.pricePredictionModelUrl) {
throw new Error('Price prediction model URL not configured');
}
const response = await axios.post(
this.pricePredictionModelUrl,
{ inputs: { token: tokenSymbol, timeframe: timeHorizon } },
{ headers: { Authorization: `Bearer ${this.huggingfaceToken}` }, timeout: 20000 }
);
if (!response.data
|| typeof response.data.currentPrice !== 'number'
|| typeof response.data.predictedPrice !== 'number'
|| typeof response.data.percentageChange !== 'number'
|| typeof response.data.confidence !== 'number') {
throw new Error('Invalid response structure from price prediction model');
}
return {
currentPrice: response.data.currentPrice,
predictedPrice: response.data.predictedPrice,
percentageChange: response.data.percentageChange,
confidence: response.data.confidence,
timestamp: new Date().toISOString()
};
}

This function simply returns the parsed result. (We will add caching to it soon.)

    •	Trading Signal: The trading signal model might accept a flag for including detailed analysis text. In our design, getTradingSignal(token, includeAnalysis) returns a signal (one of 'BUY', 'SELL', 'HOLD'), a numeric strength (perhaps a confidence level), an array of reasons (justifications for the signal), and optionally an analysis text if includeAnalysis was true. For example:

async getTradingSignal(tokenSymbol: string, includeAnalysis = false): Promise<TradingSignalResponse> {
tokenSymbol = tokenSymbol.toUpperCase();
if (!this.tradingSignalModelUrl) {
throw new Error('Trading signal model URL not configured');
}
const response = await axios.post(
this.tradingSignalModelUrl,
{ inputs: { token: tokenSymbol, includeAnalysis } },
{ headers: { Authorization: `Bearer ${this.huggingfaceToken}` }, timeout: 15000 }
);
if (!response.data
|| !['BUY','SELL','HOLD'].includes(response.data.signal)
|| typeof response.data.strength !== 'number'
|| !Array.isArray(response.data.reasons)) {
throw new Error('Invalid response structure from trading signal model');
}
return {
token: tokenSymbol,
signal: response.data.signal as 'BUY' | 'SELL' | 'HOLD',
strength: response.data.strength,
reasons: response.data.reasons || [],
analysis: includeAnalysis ? response.data.analysis : null,
timestamp: new Date().toISOString()
};
}

Here we ensure the signal is one of the expected strings and that reasons come as an array. The analysis field might be a long text explanation (returned by the model if requested); we include it when includeAnalysis is true.

    •	Comprehensive Analysis: If using a combined model (or if you plan to combine the results of the above three), implement getComprehensiveAnalysis(token) accordingly. In our case, we assume a model that returns an overall recommendation (BUY/SELL/HOLD) plus maybe embedded results for sentiment, prediction, and signal. For example:

async getComprehensiveAnalysis(tokenSymbol: string): Promise<ComprehensiveAnalysisResponse> {
tokenSymbol = tokenSymbol.toUpperCase();
if (!this.comprehensiveAnalysisModelUrl) {
throw new Error('Comprehensive analysis model URL not configured');
}
const response = await axios.post(
this.comprehensiveAnalysisModelUrl,
{ inputs: { token: tokenSymbol } },
{ headers: { Authorization: `Bearer ${this.huggingfaceToken}` }, timeout: 30000 }
);
if (!response.data || !['BUY','SELL','HOLD'].includes(response.data.recommendation)) {
throw new Error('Invalid response structure from comprehensive analysis model');
}
return {
token: tokenSymbol,
timestamp: new Date().toISOString(),
sentiment: response.data.sentiment, // assuming the model returns a nested sentiment object
prediction: response.data.prediction, // and a nested prediction object
signal: response.data.signal, // and trading signal object
recommendation: response.data.recommendation as 'BUY'|'SELL'|'HOLD'
};
}

If your comprehensive model doesn’t return the sub-components, you could alternatively call getSentimentAnalysis, getPricePrediction, and getTradingSignal in parallel, then derive a recommendation. But using a single model can simplify the logic.

d. Export the service: At the bottom of aiService.ts, instantiate and export a singleton (so that the models and token are initialized once):

const aiService = new AIService();
export default aiService;

After this step, we have an aiService ready to call external AI APIs. At this stage, it fetches fresh results every time. Next, we will add Supabase caching to these methods to reuse recent results.

2. Implementing Supabase Caching (dbService.ts)

To avoid hitting the Hugging Face API on every request (which can be slow and rate-limited), we implement caching in Supabase. The strategy is to store each AI response in a database table with a timestamp, and retrieve the latest entry for a given token (and timeframe, if applicable) on subsequent calls. If the cached entry is recent (within a defined duration), we return it instead of calling the model again.

a. Initialize Supabase client: In services/db/dbService.ts, ensure a Supabase client is created using the URL and key from env. Typically, you create a singleton client:

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
export const getSupabaseClient = (): SupabaseClient => {
if (!supabaseInstance) {
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
throw new Error('Supabase URL or anon key not found in environment');
}
supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, { /_ options _/ });
}
return supabaseInstance;
};

This uses the anon key (sufficient for our use if we configure read/write permissions on the relevant tables for the anon role in Supabase). If you prefer to use the service role key for unrestricted access on server-side, you could create a separate client with SUPABASE_SERVICE_ROLE_KEY for sensitive operations, but be careful to never expose that to the client.

b. Define helper functions for caching: We will add functions like storeSentimentAnalysis, getLatestSentiment, and analogous ones for predictions and signals. In dbService.ts, under an exported object (e.g. export const dbService = { ... }), implement these methods:
• Store Sentiment: Insert a new sentiment analysis record:

async storeSentimentAnalysis(data: {
token_symbol: string;
sentiment_score: number;
timeframe: '1h' | '24h' | '7d';
sources: string[];
}) {
const supabase = getSupabaseClient();
const { error } = await supabase.from(Tables.SENTIMENT_ANALYSIS).insert({
token_symbol: data.token_symbol,
sentiment_score: data.sentiment_score,
timeframe: data.timeframe,
sources: data.sources,
created_at: new Date().toISOString(),
});
if (error) {
throw error;
}
logger.info('Sentiment analysis stored', { token: data.token_symbol, timeframe: data.timeframe });
}

    •	Get Latest Sentiment: Query the most recent sentiment for a token and timeframe:

async getLatestSentiment(tokenSymbol: string, timeframe: '1h' | '24h' | '7d') {
const supabase = getSupabaseClient();
const { data, error } = await supabase
.from(Tables.SENTIMENT_ANALYSIS)
.select('\*')
.eq('token_symbol', tokenSymbol)
.eq('timeframe', timeframe)
.order('created_at', { ascending: false })
.limit(1);
if (error) {
throw error;
}
return data?.[0] || null;
}

This will return an object with the latest analysis or null if none exists.

    •	Store Price Prediction: Similar to sentiment, insert into predictions table:

async storePricePrediction(data: {
token_symbol: string;
current_price: number;
predicted_price: number;
percentage_change: number;
confidence: number;
}) {
const supabase = getSupabaseClient();
const { error } = await supabase.from(Tables.PREDICTIONS).insert({
token_symbol: data.token_symbol,
current_price: data.current_price,
predicted_price: data.predicted_price,
percentage_change: data.percentage_change,
confidence: data.confidence,
created_at: new Date().toISOString(),
});
if (error) throw error;
logger.info('Price prediction stored', { token: data.token_symbol });
}

    •	Get Latest Prediction: Fetch the latest from predictions table for a token (and optionally a timeframe if your predictions are time-horizon specific):

async getLatestPrediction(tokenSymbol: string) {
const supabase = getSupabaseClient();
const { data, error } = await supabase
.from(Tables.PREDICTIONS)
.select('\*')
.eq('token_symbol', tokenSymbol)
.order('created_at', { ascending: false })
.limit(1);
if (error) throw error;
return data?.[0] || null;
}

(Note: if your price predictions vary by timeframe (1h, 24h, etc.), include a .eq('time_horizon', horizon) in the query and store that field as well in storePricePrediction.)

    •	Store Trading Signal: Insert a new entry in trade_signals:

async storeTradeSignal(data: {
token_symbol: string;
signal: 'BUY' | 'SELL' | 'HOLD';
strength: number;
reasons: string[];
analysis?: string | null;
}) {
const supabase = getSupabaseClient();
const { error } = await supabase.from(Tables.TRADE_SIGNALS).insert({
token_symbol: data.token_symbol,
signal: data.signal,
strength: data.strength,
reasons: data.reasons,
analysis: data.analysis || null,
created_at: new Date().toISOString(),
});
if (error) throw error;
logger.info('Trade signal stored', { token: data.token_symbol, signal: data.signal });
}

    •	Get Latest Trading Signal: Query the latest signal for a token:

async getLatestTradeSignal(tokenSymbol: string) {
const supabase = getSupabaseClient();
const { data, error } = await supabase
.from(Tables.TRADE_SIGNALS)
.select('\*')
.eq('token_symbol', tokenSymbol)
.order('created_at', { ascending: false })
.limit(1);
if (error) throw error;
return data?.[0] || null;
}

Be sure to define the table names in an enum or constants (e.g., Tables.PREDICTIONS = 'predictions', etc., at the top of the file if not already defined).

c. Integrate caching in AI service methods: Now switch back to aiService.ts. We will update each method to use the dbService for caching. At the top of aiService.ts, import the database service: import dbService from '../db/dbService'; (and ensure it’s exporting an object with our functions).

Introduce some cache duration constants for clarity:

const SENTIMENT_CACHE_DURATION = 3600000; // 1 hour in ms
const PREDICTION_CACHE_DURATION = 1800000; // 30 minutes
const SIGNAL_CACHE_DURATION = 900000; // 15 minutes

These define how long we consider cached results fresh for each category (you can adjust these values based on how quickly you expect the real data to change).

Now modify each AI fetch method:
• Sentiment: Before making the external API call, check cache (unless forceRefresh is true):

if (!forceRefresh) {
const cachedResult = await dbService.getLatestSentiment(tokenSymbol, timeframe);
if (cachedResult) {
const cacheAge = Date.now() - new Date(cachedResult.created_at).getTime();
if (cacheAge < SENTIMENT_CACHE_DURATION) {
aiLogger.info('Using cached sentiment result', { tokenSymbol, timeframe, cacheAge: `${Math.round(cacheAge/1000)}s` });
return {
score: cachedResult.sentiment_score,
sources: cachedResult.sources,
cached: true,
timestamp: cachedResult.created_at
};
}
aiLogger.info('Cached sentiment result expired, fetching new', { tokenSymbol, timeframe });
}
}
// (then proceed to call API as before)

After receiving a fresh result, store it in cache (best-effort):

try {
await dbService.storeSentimentAnalysis({
token_symbol: tokenSymbol,
sentiment_score: result.score,
timeframe: timeframe,
sources: result.sources
});
} catch (cacheError) {
aiLogger.error('Failed to store sentiment analysis in cache', { error: cacheError });
// continue without throwing, since caching failure shouldn't break functionality
}

    •	Price Prediction: Add similar logic. For example, at the start of getPricePrediction:

const cached = await dbService.getLatestPrediction(tokenSymbol);
if (cached) {
const age = Date.now() - new Date(cached.created_at).getTime();
if (age < PREDICTION_CACHE_DURATION) {
aiLogger.info('Using cached price prediction', { tokenSymbol });
return {
currentPrice: cached.current_price,
predictedPrice: cached.predicted_price,
percentageChange: cached.percentage_change,
confidence: cached.confidence,
timestamp: cached.created_at,
// we can optionally add `cached: true` to the type if desired
};
}
}
// ...make external call if no valid cache...
const result = { /_ parse response as before, plus timestamp _/ };
// Store in cache:
try {
await dbService.storePricePrediction({
token_symbol: tokenSymbol,
current_price: result.currentPrice,
predicted_price: result.predictedPrice,
percentage_change: result.percentageChange,
confidence: result.confidence
});
} catch(e) {
aiLogger.error('Failed to cache price prediction', { error: e });
}
return result;

You might want to include a forceRefresh parameter similar to sentiment if users should bypass cache manually, but it’s optional for prediction/signal in this context.

    •	Trading Signal: Do the same in getTradingSignal:

const cached = await dbService.getLatestTradeSignal(tokenSymbol);
if (cached) {
const age = Date.now() - new Date(cached.created_at).getTime();
if (age < SIGNAL_CACHE_DURATION) {
aiLogger.info('Using cached trading signal', { tokenSymbol });
return {
token: tokenSymbol,
signal: cached.signal,
strength: cached.strength,
reasons: cached.reasons || [],
analysis: cached.analysis || null,
timestamp: cached.created_at
};
}
}
// ...call Hugging Face if no fresh cache...
const result = { /_ parsed response with timestamp _/ };
// Store in cache:
try {
await dbService.storeTradeSignal({
token_symbol: tokenSymbol,
signal: result.signal,
strength: result.strength,
reasons: result.reasons,
analysis: result.analysis
});
} catch(e) {
aiLogger.error('Failed to cache trade signal', { error: e });
}
return result;

    •	Comprehensive Analysis: Depending on use, you may or may not cache this. If the comprehensive analysis is derived from others, it might quickly become stale. However, you could cache it similarly in a comprehensive_analysis table. For brevity, we can skip caching comprehensive results or implement with a moderate duration (maybe 1 hour) if needed.

After adding caching, the AI service will attempt to use recent results from Supabase first, greatly reducing response time and API usage for repeated queries. Make sure to update the return types (in types/api.ts or similar) to include any new fields we return (like the cached boolean in sentiment, or adding cached in prediction/signal if you choose to indicate it). This keeps client expectations in sync with the API.

3. Defining API Routes (api.ts and Next.js API endpoints)

Now that the core logic is in place (AI calls and caching), we expose these functionalities via Next.js API routes. We also ensure the Telegram webhook endpoint is configured to use the updated services.

a. API response types: The file types/api.ts (or api.ts) contains TypeScript interfaces for request/response shapes. Review it to ensure it matches our data. For example, it might define:

export interface SentimentAnalysisResponse {
score: number;
sources: string[];
cached: boolean;
timestamp: string;
error?: string;
}
// ... similarly for PricePredictionResponse, TradingSignalResponse, ComprehensiveAnalysisResponse ...

Update these interfaces if needed to align with any changes (for instance, if we added a cached flag to predictions or signals, reflect that here as optional or boolean). This helps with type-checking and clarity.

b. Create API route for sentiment analysis: In Next.js (with the Pages Router), create a file such as pages/api/ai/sentiment.ts (you might group under ai directory for clarity). This will handle HTTP requests for sentiment analysis. For example:

// pages/api/ai/sentiment.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import aiService from '../../../services/ai/aiService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
if (req.method !== 'GET' && req.method !== 'POST') {
res.setHeader('Allow', 'GET, POST');
return res.status(405).json({ error: 'Method not allowed' });
}

const token = (req.query.token || req.body?.token) as string | undefined;
const timeframe = (req.query.timeframe || req.body?.timeframe) as string | undefined;
if (!token) {
return res.status(400).json({ error: 'Token symbol is required' });
}
try {
const result = await aiService.getSentimentAnalysis(token, timeframe as '1h'|'24h'|'7d' || '24h');
return res.status(200).json(result);
} catch (err: any) {
console.error('Error in sentiment API:', err);
return res.status(500).json({ error: err.message || 'Failed to get sentiment analysis' });
}
}

Key points:
• We allow GET (for convenience of testing via browser) and possibly POST. For GET, we expect query params token (and optionally timeframe). For POST, one could send a JSON body {"token": "...", "timeframe": "..."}.
• Validate input: token symbol must be provided.
• Call aiService.getSentimentAnalysis with the token and timeframe. (We default to ‘24h’ if none given.)
• Return the JSON result directly. If an error is thrown from the service, catch it and respond with status 500 and an error message.

c. Create API route for price prediction: Similar to above, pages/api/ai/predict.ts:

import type { NextApiRequest, NextApiResponse } from 'next';
import aiService from '../../../services/ai/aiService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
if (req.method !== 'GET' && req.method !== 'POST') {
res.setHeader('Allow', 'GET, POST');
return res.status(405).json({ error: 'Method not allowed' });
}
const token = (req.query.token || req.body?.token) as string | undefined;
const horizon = (req.query.horizon || req.body?.horizon) as string | undefined;
if (!token) {
return res.status(400).json({ error: 'Token symbol is required' });
}
try {
const result = await aiService.getPricePrediction(token, horizon as '1h'|'24h'|'7d' || '24h');
return res.status(200).json(result);
} catch (err: any) {
console.error('Error in prediction API:', err);
return res.status(500).json({ error: err.message || 'Failed to get price prediction' });
}
}

We used a query param horizon for the time horizon (to avoid confusion with sentiment’s timeframe, but they serve a similar purpose). If your model doesn’t differentiate by horizon, you can omit this parameter.

d. Create API route for trading signal: pages/api/ai/signal.ts:

import type { NextApiRequest, NextApiResponse } from 'next';
import aiService from '../../../services/ai/aiService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
if (req.method !== 'GET' && req.method !== 'POST') {
res.setHeader('Allow', 'GET, POST');
return res.status(405).json({ error: 'Method not allowed' });
}
const token = (req.query.token || req.body?.token) as string | undefined;
const includeAnalysis = (req.query.includeAnalysis || req.body?.includeAnalysis) as string | undefined;
if (!token) {
return res.status(400).json({ error: 'Token symbol is required' });
}
try {
const include = includeAnalysis === 'true' || includeAnalysis === '1' || includeAnalysis === 'yes';
const result = await aiService.getTradingSignal(token, include);
return res.status(200).json(result);
} catch (err: any) {
console.error('Error in signal API:', err);
return res.status(500).json({ error: err.message || 'Failed to get trading signal' });
}
}

Here we parse an includeAnalysis flag (which could be passed as a query param or body, e.g. ?includeAnalysis=true). By default, if not provided, include will be false. This controls whether the AI service will request the detailed analysis text from the model.

e. (Optional) API route for comprehensive analysis: If needed, create pages/api/ai/analyze.ts (matching the /analyze command of the bot):

import type { NextApiRequest, NextApiResponse } from 'next';
import aiService from '../../../services/ai/aiService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
if (req.method !== 'GET' && req.method !== 'POST') {
res.setHeader('Allow', 'GET, POST');
return res.status(405).json({ error: 'Method not allowed' });
}
const token = (req.query.token || req.body?.token) as string | undefined;
if (!token) {
return res.status(400).json({ error: 'Token symbol is required' });
}
try {
const result = await aiService.getComprehensiveAnalysis(token);
return res.status(200).json(result);
} catch (err: any) {
console.error('Error in comprehensive analysis API:', err);
return res.status(500).json({ error: err.message || 'Failed to get comprehensive analysis' });
}
}

This route simply invokes the comprehensive analysis. It returns an object possibly containing nested objects for sentiment/prediction/signal along with an overall recommendation.

f. Wire up in Next.js: With these files in place, Next.js will auto-generate endpoints:
• /api/ai/sentiment
• /api/ai/predict
• /api/ai/signal
• /api/ai/analyze

Each corresponds to the functionality implemented. Make sure the file paths are correct and exports are default functions.

You can test these quickly (after starting the dev server) by visiting for example: http://localhost:3000/api/ai/sentiment?token=BTC – it should return a JSON (or an error if not configured properly). Initially, you might get errors if the Hugging Face models take longer than the default serverless timeout or if environment vars are missing, so check the logs and adjust as needed (for instance, if on Vercel, you may need to ensure your functions respond quickly or use background functions for long processes).

g. Telegram webhook route: The file pages/api/telegram-webhook.ts is already present to handle incoming Telegram updates. We should verify it’s properly calling our telegramService. Typically it does something like:

// pages/api/telegram-webhook.ts
import telegramService from '../../services/telegram/telegramService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
if (req.method !== 'POST') {
return res.status(405).send('Method Not Allowed');
}
// Verify secret token
const token = req.headers['x-telegram-bot-api-secret-token'];
if (token !== process.env.TELEGRAM_WEBHOOK_SECRET) {
return res.status(401).send('Unauthorized');
}
try {
await telegramService.handleUpdate(req, res);
if (!res.writableEnded) {
res.status(200).json({ ok: true });
}
} catch (err) {
console.error('Telegram webhook error:', err);
if (!res.writableEnded) {
res.status(500).send('Internal Server Error');
}
}
}

This ensures only Telegram’s requests (with the correct secret) are processed. The handleUpdate function is typically provided by the grammy bot library’s webhook callback, which we set up next. The key point is that our Next.js API routes and the Telegram webhook do not conflict; they serve different purposes (the former are for direct API access, the latter for Telegram). Next.js will route /api/telegram-webhook to this handler, and the other /api/ai/\* routes to the ones we created.

4. Enhancing Telegram Service (telegramService.ts)

The Telegram service ties everything together by processing commands from users and producing responses using the AI service. We’ll ensure it properly utilizes our new AI integration and provides a smooth user experience on Telegram.

a. Initialize the Telegram Bot: Using the grammy library, the code likely already creates a Bot instance with the bot token:

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');

Make sure the token is loaded from env. The telegramService.ts should export the bot and the handleUpdate (webhook callback). In our code, we use webhookCallback(bot, 'next-js') from grammy to create a request handler that is compatible with Next.js. This handleUpdate function is what the webhook API route calls. There’s no need to call bot.start() in webhook mode.

b. Implement command handlers: The service should define handlers for each command: /start, /help, /sentiment, /predict, /signal, /analyze, /trade, etc. These handlers are typically set up like:

bot.command('start', commands.start);
bot.command('help', commands.help);
bot.command('sentiment', commands.sentiment);
// ...

Where commands is an object mapping to our functions. In our file, it might simply directly use bot.command('sentiment', async ctx => { ... }). Either approach is fine.

Focus on the AI-related commands:
• /sentiment: This command should extract the token symbol argument and call aiService.getSentimentAnalysis. In our implementation:

sentiment: async (ctx: Context) => {
const message = ctx.message?.text || '';
const params = message.split(' ');
if (params.length < 2) {
return ctx.reply('Please provide a token symbol. Example: /sentiment BTC');
}
const tokenSymbol = params[1].toUpperCase();
telegramLogger.info('Sentiment command received', { token: tokenSymbol, user: ctx.from?.id });
// Acknowledge the command
const statusMessage = await ctx.reply(`Analyzing market sentiment for ${tokenSymbol}...`);
try {
const sentiment = await aiService.getSentimentAnalysis(tokenSymbol);
// Determine sentiment label and emoji
let sentimentText = 'neutral', emoji = '😐';
if (sentiment.score > 0.6) { sentimentText = 'very positive'; emoji = '🔥'; }
else if (sentiment.score > 0.2) { sentimentText = 'positive'; emoji = '😀'; }
else if (sentiment.score < -0.6) { sentimentText = 'very negative'; emoji = '📉'; }
else if (sentiment.score < -0.2) { sentimentText = 'negative'; emoji = '😕'; }
const responseText =
`${emoji} *${tokenSymbol}* Sentiment: *${sentimentText.toUpperCase()}*\n\n` +
`Score: \`${(sentiment.score * 100).toFixed(1)}%\`\n` +
      `Sources analyzed: ${sentiment.sources.length || 'N/A'}\n` +
      `${sentiment.cached ? '_(Analysis from cache)_' : '_(Fresh analysis)_'}\n\n`+
     `_Tip:_ Want a trading signal? Try /signal ${tokenSymbol}`;
    await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, responseText, { parse_mode: 'Markdown' });
  } catch (error) {
    telegramLogger.error('Error getting sentiment analysis', { error, token: tokenSymbol });
    await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id,
      `⚠️ Sorry, I couldn't analyze sentiment for ${tokenSymbol} at this time.`);
}
}

A few notes on this:
• We immediately reply with a processing message to avoid Telegram’s 5-second timeout for bot responses. This gives the user feedback that analysis is underway.
• Once aiService.getSentimentAnalysis returns, we format the result. We converted the numeric score to a percentage and classified it as very positive/positive/neutral/negative/etc. This is purely for UX.
• We include an indicator whether the result came from cache ((Analysis from cache) vs (Fresh analysis)), which is a nice transparency feature made possible by our cached flag.
• Finally, we edit the original message with the full response. This way, the bot’s chat isn’t flooded with multiple messages, and the user sees the result appear in place of the loading text.
• On errors, we log them and inform the user that the analysis failed.

    •	/predict: Similar structure: get the token symbol, send “Generating price prediction…” message, then call aiService.getPricePrediction. For example:

predict: async (ctx) => {
const params = ctx.message?.text?.split(' ') || [];
if (params.length < 2) {
return ctx.reply('Please provide a token symbol. Example: /predict BTC');
}
const tokenSymbol = params[1].toUpperCase();
const statusMessage = await ctx.reply(`Generating price prediction for ${tokenSymbol}...`);
try {
const prediction = await aiService.getPricePrediction(tokenSymbol);
const priceChange = prediction.percentageChange >= 0 ? 'increase' : 'decrease';
const emoji = prediction.percentageChange >= 0 ? '📈' : '📉';
const responseText =
`${emoji} *${tokenSymbol}* 24h Price Prediction:\n\n` +
`Current Price: $${prediction.currentPrice.toLocaleString()}\n` +
`Predicted Price: $${prediction.predictedPrice.toLocaleString()}\n` +
`Expected ${priceChange}: ${(Math.abs(prediction.percentageChange)).toFixed(2)}%\n` +
`Confidence: ${(prediction.confidence * 100).toFixed(0)}%\n\n` +
`*Tip:* For a full analysis, try /analyze ${tokenSymbol}`;
await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, responseText);
} catch (error) {
await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id,
`⚠️ Sorry, I couldn't generate a price prediction for ${tokenSymbol} at this time.`);
}
}

We highlight if the prediction is an increase or decrease and by what percent, including a confidence level. After seeing this, a user might want more info, so we prompt them to use the comprehensive analysis.

    •	/signal: The handler calls aiService.getTradingSignal(token, includeAnalysis=true) to get not only the signal but also reasons. For example:

signal: async (ctx) => {
const params = ctx.message?.text?.split(' ') || [];
if (params.length < 2) {
return ctx.reply('Please provide a token symbol. Example: /signal BTC');
}
const tokenSymbol = params[1].toUpperCase();
const statusMessage = await ctx.reply(`Generating trading signal for ${tokenSymbol}...`);
try {
const signal = await aiService.getTradingSignal(tokenSymbol, true);
let emoji = '⏹️'; // default neutral emoji
if (signal.signal === 'BUY') emoji = '🟢';
else if (signal.signal === 'SELL') emoji = '🔴';
const strengthPct = (signal.strength _ 100).toFixed(0);
const reasonsList = signal.reasons.map(r => `• ${r}`).join('\n');
const responseText =
`${emoji} _${tokenSymbol}* Trading Signal: *${signal.signal}*\n\n`+
     `Signal Strength: ${strengthPct}%\n` +
      (signal.reasons.length ? `Reasons:\n${reasonsList}\n\n`: '\n') +
     `*Tip:\* To execute this signal, use /trade ${tokenSymbol} ${signal.signal}`;
    await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, responseText, { parse_mode: 'Markdown' });
  } catch (error) {
    await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id,
      `⚠️ Sorry, I couldn't generate a trading signal for ${tokenSymbol} at this time.`);
}
}

We format the reasons as a bullet list and suggest the user can execute the trade with the /trade command. Note: signal.strength is a number from 0 to 1 presumably, we convert to percentage.

    •	/analyze: This combines everything:

analyze: async (ctx) => {
const params = ctx.message?.text?.split(' ') || [];
if (params.length < 2) {
return ctx.reply('Please provide a token symbol. Example: /analyze BTC');
}
const tokenSymbol = params[1].toUpperCase();
const statusMessage = await ctx.reply(`Generating comprehensive analysis for ${tokenSymbol}...`);
try {
const analysis = await aiService.getComprehensiveAnalysis(tokenSymbol);
let emoji = '⏹️';
if (analysis.recommendation === 'BUY') emoji = '🟢';
else if (analysis.recommendation === 'SELL') emoji = '🔴';
const sentimentScore = analysis.sentiment ? `${(analysis.sentiment.score * 100).toFixed(1)}%` : 'N/A';
let priceChangeText = 'N/A';
if (analysis.prediction) {
const dir = analysis.prediction.percentageChange >= 0 ? '📈' : '📉';
priceChangeText = `${dir} ${(Math.abs(analysis.prediction.percentageChange)).toFixed(2)}%`;
}
const signalText = analysis.signal ? analysis.signal.signal : 'N/A';
const responseText =
`${emoji} *${tokenSymbol}* Comprehensive Analysis\n\n` +
`Market Sentiment: ${sentimentScore}\n` +
`24h Price Outlook: ${priceChangeText}\n` +
`Trading Signal: ${signalText}\n\n` +
`Overall Recommendation: *${analysis.recommendation}*\n\n` +
`*Tip:* You can execute this recommendation with /trade ${tokenSymbol} ${analysis.recommendation}`;
await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, responseText, { parse_mode: 'Markdown' });
} catch (error) {
await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id,
`⚠️ Sorry, I couldn't analyze ${tokenSymbol} at this time. Please try again later.`);
}
}

This presents a summary of sentiment, price prediction, and signal, then an overall recommendation (as given by the model). We choose appropriate emojis and formats for each part. The user is then nudged to execute the recommended trade if they wish.

c. Other commands: The /start and /help commands should list available commands and guide the user. Ensure they mention the new commands (/sentiment, /predict, /signal, /analyze) and how to use them. The code provided in the template already includes a welcome message enumerating these.

d. Best practices implemented:
• Each command handler uses a try/catch to handle errors gracefully. If an AI service call fails (due to timeout or exception), we catch it and inform the user with a generic apology and no sensitive info leak.
• Long operations are handled with a placeholder message edit pattern to keep the interaction smooth.
• The Telegram webhook secret is checked in the API route (as shown earlier), which is crucial for security (only Telegram should trigger our bot, not random HTTP requests).
• We log important events (like command received, errors, etc.) via the telegramLogger, which helps in monitoring usage and troubleshooting if something goes wrong in production.
• The Telegram service also likely stores user info on /start (via dbService.storeUser) and maybe handles wallet connections on /connect (storing the wallet address, etc.), ensuring the backend has necessary context for trading commands. These parts are not our focus, but make sure they are functioning if present.

At this point, the Telegram bot is fully integrated with the AI service. Users can request analyses and receive AI-driven responses within chat, with caching ensuring faster responses if they repeat queries.

5. Modifying the Trading Engine (tradingEngine.ts) to Use AI Insights

The trading engine manages actual trade execution or simulation. We will enhance it to optionally use AI-generated insights for deciding trades. Specifically, we can introduce an “auto-trade” feature where the bot decides to buy or sell based on AI signals if the user requests it.

a. Current trade command workflow: As implemented, the /trade command expects the user to specify a token and a direction (BUY or SELL), and optionally an amount (the code defaults to some amount if not provided). It then uses handleTradeCommand to parse the input and execute the trade (in our case, simulateTrade is called to dummy execute and return a result).

However, our help text hinted that the user might just provide a token and amount (e.g. /trade BTC 0.5) without explicitly saying BUY or SELL. We’ll clarify and handle that case using AI:

b. Allow AI-driven direction (“AUTO” trade): We modify the trade parsing logic (parseTradingCommand) to interpret an omitted direction as a request for AI decision. For example:
• If the user provides only two arguments after /trade (e.g. “BTC” and “0.5”), or if they explicitly put “AUTO” as the direction, we will trigger the AI to decide whether to buy or sell.
• If the user provides three arguments (symbol, direction, amount) in the normal way, we respect their choice.

Implementation:

export function parseTradingCommand(messageText: string): { symbol: string; direction: 'BUY' | 'SELL' | 'AUTO'; amount: number } {
const parts = messageText.split(' ');
if (parts.length < 3) {
throw new Error('Invalid trade command. Usage: /trade <symbol> <BUY|SELL|AUTO> [amount]');
}
const symbol = parts[1].toUpperCase();
let directionInput = parts[2].toUpperCase();
let amount: number;
if (directionInput === 'BUY' || directionInput === 'SELL') {
// User explicitly gave direction
if (parts.length >= 4) {
amount = parseFloat(parts[3]);
if (isNaN(amount) || amount <= 0) throw new Error('Trade amount must be a positive number');
} else {
amount = 0.01; // default amount if not provided
}
return { symbol, direction: directionInput as 'BUY'|'SELL', amount };
} else {
// If direction is not BUY/SELL, treat it as amount and use AI to decide direction
// e.g. user did: /trade BTC 0.5 (0.5 is actually the amount, direction omitted)
const possibleAmount = parseFloat(parts[2]);
if (!isNaN(possibleAmount) && possibleAmount > 0) {
amount = possibleAmount;
return { symbol, direction: 'AUTO', amount };
} else if (directionInput === 'AUTO') {
// user explicitly wrote 'AUTO' as direction
if (parts.length < 4) {
throw new Error('Please specify an amount when using AUTO trade');
}
amount = parseFloat(parts[3]);
if (isNaN(amount) || amount <= 0) throw new Error('Trade amount must be a positive number');
return { symbol, direction: 'AUTO', amount };
} else {
throw new Error('Trade direction must be BUY, SELL, or AUTO');
}
}
}

Now the parsed direction can be 'AUTO'. We adjust the return type accordingly.

c. Use AI to determine trade direction: In handleTradeCommand, after parsing, add logic for AUTO:

export async function handleTradeCommand(messageText: string, userData: { userId: number; walletAddress: string; blockchain: 'BSC'|'NEAR'; }) {
try {
const tradeParams = parseTradingCommand(messageText);
let { symbol, direction, amount } = tradeParams;
// If AI decision is requested:
if (direction === 'AUTO') {
const aiSignal = await aiService.getTradingSignal(symbol);
if (aiSignal.signal === 'HOLD') {
// If AI says hold, we choose not to trade
return {
success: false,
message: `🤖 AI suggests to *HOLD* ${symbol}. No trade executed.`
};
} else {
direction = aiSignal.signal;
// Optionally, inform in the message that AI chose this direction
// (We'll include that in the success message below)
}
}
// Execute the trade (simulation or real)
const result = await simulateTrade({ symbol, direction: direction as 'BUY'|'SELL', amount, userId: userData.userId, walletAddress: userData.walletAddress, blockchain: userData.blockchain });
if (result.status === 'COMPLETED') {
let baseMessage = `✅ Successfully ${direction === 'BUY' ? 'bought' : 'sold'} ${amount} ${symbol} at $${result.price.toFixed(2)}.`;
if (tradeParams.direction === 'AUTO') {
baseMessage += " (Action decided by AI)";
}
return {
success: true,
message: baseMessage,
txHash: result.txHash,
price: result.price
};
} else {
return {
success: false,
message: `❌ Trade failed: ${result.error || 'Unknown error'}`
};
}
} catch (error: any) {
tradingLogger.error('Error handling trade command', { error: error.message || error, messageText });
return {
success: false,
message: `❌ Trade command error: ${error.message || 'Unknown error'}`
};
}
}

Changes made:
• If direction is 'AUTO', we call aiService.getTradingSignal(symbol) with default includeAnalysis=false (since we only need the buy/sell decision). We then decide:
• If the AI recommends HOLD, we cancel the trade, returning a message indicating that AI suggests not to trade (the Telegram service will relay this to user).
• If AI returns BUY or SELL, we set that as the direction and proceed.
• When building the success message, we append a note if the action was decided by AI. This transparency helps the user know the bot made the call.
• Errors and actual trade execution remain handled as before.

d. Integrate with Telegram: The Telegram /trade handler in telegramService.ts uses handleTradeCommand. After our changes, it automatically benefits. The Telegram handler likely does:

trade: async (ctx) => {
// ... after verifying user and wallet ...
const statusMessage = await ctx.reply(`Processing trade request...`);
const tradeResult = await handleTradeCommand(message, { userId: user.id, walletAddress: wallet.wallet_address, blockchain: wallet.blockchain });
if (tradeResult.success) {
await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id,
`${tradeResult.message}\n\nTransaction: ${tradeResult.txHash?.slice(0,8)}...${tradeResult.txHash?.slice(-6)}\n\nUse /portfolio to view your holdings.`);
} else {
await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, tradeResult.message);
}
}

This will display either the success (with TX hash if available) or failure message returned from handleTradeCommand. With our enhancements:
• If the user did /trade BTC AUTO 0.5 or just /trade BTC 0.5, the bot will execute either a buy or sell based on AI recommendation and inform the user accordingly.
• If the user provided a direction explicitly, the bot executes as commanded.

e. Security & best practices in trading:
• We ensured the user has a connected wallet (dbService.getWalletConnections) and proper setup before executing a trade. The code returns early with instructions if not.
• Private keys or sensitive operations: In this simulation, we’re not actually sending a transaction (simulateTrade fakes it). In a real scenario, ensure private keys are securely stored (never in plaintext in DB without encryption) and use environment configs or vaults if needed.
• The trading engine uses environment RPC URLs (like BSC RPC) or defaults, which is configurable and avoids hardcoding values.
• We log any errors in trading to help debug failed trades.

With trading now able to leverage AI signals, our bot can not only analyze but also act on AI advice when prompted.

6. Updating Configuration and Deployment Settings

To finalize, we need to update configuration files and verify everything is set for a smooth deployment:

a. Environment Variables: Double-check that your .env.local contains all required keys as outlined in Prerequisites. For development, Next.js will load them automatically. For deployment (e.g., on Vercel), go to your project settings and add the environment variables:
• HUGGINGFACE*API_TOKEN and all HUGGINGFACE*...\_URL variables (four URLs for the models).
• SUPABASE_URL, SUPABASE_ANON_KEY (and SUPABASE_SERVICE_ROLE_KEY if you ended up using it anywhere).
• TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET.
• Any others like blockchain RPC URLs if used.

Make sure not to commit the actual secret values to the repository. .env.local should be listed in .gitignore. Only share these values through secure channels (like Vercel’s encrypted env vars).

b. package.json and dependencies: Our implementation used:
• axios for HTTP requests (already listed as dependency).
• @supabase/supabase-js for database (already listed).
• grammy for Telegram (already listed).
• pino or another logger for logging (ensure it’s included).
• If you added any package, run npm install and update package.json. In our context, we did not add new packages outside what was given.

The scripts in package.json (dev, build, start) remain standard for Next.js. No changes needed there. Just ensure your Next.js version is sufficient (Next 13 is fine for these API routes).

c. TypeScript Config: We used path aliases like '@/_' in tsconfig. If you prefer to use them (e.g., import from '@/services/ai/aiService' instead of relative paths), ensure it’s configured and working. In tsconfig.json, "baseUrl": ".", "paths": { "@/_": ["./*"] } is given, which means you can use import dbService from '@/services/db/dbService'; anywhere. This can make imports cleaner, but make sure to adjust existing import statements accordingly if you choose to use it consistently.

d. Linting and Formatting: Run npm run lint to catch any issues. Our additions should conform to standard practices (like no unused vars, etc.). Also consider formatting the code (npm run format if you have a formatter setup) to keep style consistent.

e. Security Review:
• All secrets are kept in env vars (no hard-coded tokens). 👍
• The Telegram webhook is protected by a secret header check. 👍
• The Supabase anon key is used server-side only; ensure your Supabase rules allow the operations we perform (or switch to service role with caution). For caching tables, it’s usually fine to allow insert/select to anon if your API never exposes supabase directly to client (it doesn’t in our case).
• We handle errors gracefully and log them for internal review. Users do not see raw errors or stack traces.
• The system avoids unnecessary external calls thanks to caching, which also mitigates hitting external rate limits and speeds up response — making it more robust under heavy usage.

With code complete, we can move on to automating some of these steps using AI tools, and then to testing and deployment.

Automation with Cursor Composer & Claude 3.7

Implementing the above steps can be expedited by using AI-powered development tools. Here’s how you can leverage Cursor Composer or Claude 3.7 to generate and modify code quickly: 1. Using Cursor to create files and boilerplate: Open your project in Cursor. For each new file we identified (e.g., pages/api/ai/sentiment.ts, pages/api/ai/predict.ts, etc.), you can use Cursor’s file creation command or simply create the file and then use an AI prompt to fill it. For example:
• Create a new file sentiment.ts under pages/api/ai. Inside the file, write a comment or prompt like: “Next.js API route to return sentiment analysis for a given token. Use aiService.getSentimentAnalysis and handle GET/POST.” Then ask Cursor to generate code. It should produce a handler similar to what we wrote, which you can refine.
• Repeat for predict.ts, signal.ts, and analyze.ts. You can copy the structure from one to another, adjusting function calls and parameters. Cursor can help by refactoring the copied code when you instruct it to “replace calls to getSentimentAnalysis with getPricePrediction and adjust response fields accordingly,” for example. 2. Automating service and DB changes: Open aiService.ts in Cursor. You likely have partial implementations of caching (for sentiment) in place. Use Cursor’s multiple selection or chat to apply similar caching logic to other methods:
• Prompt example: “Add caching logic to getPricePrediction similar to getSentimentAnalysis: check Supabase for last prediction and use it if within 30 min, otherwise call API and then store result.” Cursor will attempt to insert code for cache checking and storing. Review its output, especially for correct function names from dbService.
• Do the same for getTradingSignal. Ensure it uses the right cache duration and calls dbService.getLatestTradeSignal/storeTradeSignal.
• If dbService.ts doesn’t yet have those functions, open it and prompt Cursor: “Implement functions storePricePrediction, getLatestPrediction, storeTradeSignal, getLatestTradeSignal similar to storeSentimentAnalysis.” Because the file already has store/get for sentiment, the AI can follow that pattern. Provide the expected table names and fields in your prompt for accuracy (you can copy from our guide or the code above). 3. Using Claude for logic planning: Claude 3.7 (via a chat interface or IDE integration) can be useful to generate code or explain integration points. For instance, you can copy the content of tradingEngine.ts into Claude and ask: “How to modify this to support an AUTO trade using AI signals?” Claude might describe the changes needed (similar to what we did). You can then apply those changes manually or with Cursor.
• If you prefer, you can ask Claude to actually generate the updated function code. For example: “Write a revised handleTradeCommand that checks for ‘AUTO’ direction and calls aiService.getTradingSignal to decide buy/sell.” Verify the output and integrate it into your code. 4. Multi-file context: Both Cursor and Claude can utilize multiple files as context. Make sure to provide the relevant parts (for example, if generating the Telegram command handler, supply the function signature and maybe an example of another command handler so it follows the style).
• For Cursor, this might mean opening all involved files side by side (aiService, dbService, telegramService, tradingEngine) so it has them in context when you prompt changes.
• For Claude, you might need to paste snippets or summarize them in your prompt. 5. Testing generated code with AI: After generation, you can even ask the AI to simulate a call. For example: “Given the current state of aiService.getSentimentAnalysis, what happens if the cache is fresh vs expired? Did we set the cached flag correctly in the returned object?” This can double-check logic. Or simply run the app and test (which we’ll cover next), then come back to AI if something misbehaves. 6. Maintaining best practices: When using AI tools, it’s easy for style or minor details to drift. Always review the AI’s output:
• Check that all async functions are awaited properly.
• Ensure no sensitive info is accidentally logged.
• Confirm that TypeScript types line up (Cursor/Claude might not perfectly adhere to existing interfaces, so adjust types or AI output as needed).
• Run npm run build to catch any type errors or syntax issues the AI might have introduced.
• Use your linter/formatter to keep code clean.

By iteratively using Cursor or Claude, you can implement the steps above much faster than writing everything from scratch. For example, you might have generated 80% of the boilerplate for API routes and only needed to tweak a few lines. This frees you to focus on application logic and testing.

Example prompt sessions:
• In Cursor: Open dbService.ts. Select the block after storeSentimentAnalysis. Write a comment: // TODO: Implement caching for predictions similar to sentiment and ask Cursor to fill it. It should create storePricePrediction and getLatestPrediction functions. Verify the table names match your actual Supabase schema.
• With Claude: “Here is the function getSentimentAnalysis. Write a similar function getPricePrediction that uses a caching mechanism (30min TTL) for the predictions table.” Claude will output a function code, which you can integrate.

Leveraging these AI tools can also help update documentation or generate mermaid diagrams if needed (for instance, you could ask Claude to output a Mermaid flow based on a described process – although in our case, we wrote it manually for precision).

In summary, Cursor Composer and Claude act as smart pair-programmers, speeding up development. Use them to handle repetitive patterns (like similar functions for each model, or similar API routes), but always keep a human eye on the overall coherence and correctness of the code.

Testing & Deployment Guide

With implementation complete, it’s crucial to test each part thoroughly before deploying to production.

a. Local Testing: 1. Start the development server: Run npm run dev. Ensure it compiles without errors. Fix any TypeScript errors or undefined variables that might have been introduced. 2. Test API Endpoints: Using a tool like curl, Postman, or a web browser:
• Get sentiment:

curl "http://localhost:3000/api/ai/sentiment?token=BTC&timeframe=24h"

You should receive a JSON response with a score, sources (possibly an array of URLs or texts), a timestamp, and cached: false (the first time). Try the same request again; the second time it should be much faster and return cached: true (and the same score) because it hits the cache.

    •	Get prediction:

curl "http://localhost:3000/api/ai/predict?token=ETH&horizon=24h"

Expect a JSON with currentPrice, predictedPrice, etc. If you call it twice in quick succession, the second should use cache.

    •	Get signal:

curl "http://localhost:3000/api/ai/signal?token=SOL&includeAnalysis=true"

This should return a signal (BUY/SELL/HOLD) with reasons. If includeAnalysis=false or omitted, it might return without the analysis text (depending on our implementation).

    •	Comprehensive:

curl "http://localhost:3000/api/ai/analyze?token=BNB"

Should return the combined object (with nested sentiment/prediction/signal and a recommendation).

    •	If any of these return an error, check the terminal logs:
    •	Make sure the environment variables are loaded (in dev, Next.js should load from .env.local). If not, you might need to stop and restart npm run dev after creating .env.local.
    •	If you see errors from axios calls, ensure the URLs and token are correct. (Hugging Face might also return 503 if the model is cold-starting; give it a moment and try again.)
    •	Check Supabase: if getLatestSomething throws an error, verify your table exists and has the proper name and permissions. You can use Supabase dashboard or logs to debug.

    3.	Test Telegram bot locally: Telegram’s webhook won’t hit your local machine unless you use a tunnel. You have two options for testing:
    •	Use polling mode (temporarily): As an alternative to webhooks, you can run the bot in polling mode in development. For example, modify telegramService.ts to start the bot if not in production:

if (process.env.NODE_ENV !== 'production') {
bot.start(); // This will start long-polling Telegram for updates (development only)
}

Then run the dev server. The bot will connect and you can interact with it on Telegram directly (no webhook needed). Remember to remove or disable this in production, as we use webhooks there.

    •	Use a tunneling service: Start the dev server and then run a tool like ngrok to expose localhost:3000. Set the Telegram webhook to your ngrok URL (https://<random>.ngrok.io/api/telegram-webhook). Then send commands to the bot. This way, you test the exact webhook flow.
    •	Either way, test the main commands:
    •	/start – the bot should greet you and list commands (and store your user in Supabase).
    •	/sentiment BTC – it should reply with “Analyzing…” then edit to show the sentiment result. Try it twice to see the “from cache” note the second time.
    •	/predict BTC – should show a prediction.
    •	/signal BTC – should show a signal with reasons.
    •	/analyze BTC – should show a combined analysis with recommendation.
    •	/trade BTC BUY 0.01 – if you have set up a wallet connection for your user in the DB (or if the bot has a /connect flow you can simulate), it should simulate a trade. If you don’t have a wallet entry, the bot will likely respond with “You need to connect a wallet first.” For testing purposes, you can insert a dummy wallet in the wallet_connections table for your user (with is_default=true). Or temporarily bypass that check in code for local testing.
    •	/trade BTC 0.01 (auto mode) – the bot should respond that it’s processing, then either “Successfully bought/sold … (decided by AI)” or tell you AI suggested hold. This tests our auto trade feature.
    •	Observe the logs for any errors or unhandled exceptions. Address them as needed. Common issues could be misnamed env vars, or forgetting to await something, etc.

    4.	Unit Tests: If you have any Jest tests (as indicated by jest in devDependencies), run npm run test. There may not be specific tests for our new features unless you wrote some. Consider writing a few basic tests for parseTradingCommand logic (to ensure AUTO is handled correctly) and for the caching (maybe mocking dbService and aiService to test the branching). This is optional but good for maintenance.

b. Deployment on Vercel: 1. Push code to repository: Commit all changes and push to your Git repository (GitHub, GitLab, etc.). 2. Vercel project setup: If not already, create a new project on Vercel and import your repository. Vercel will detect the Next.js app and configure the build automatically. 3. Environment Variables on Vercel: In your Vercel dashboard, go to Settings > Environment Variables. Add all the variables from your .env.local. For security, you might want to add them to “Production” environment (and maybe also add to Preview if you use staging deployments). 4. Deploy: Trigger a deploy (by pushing to the main branch or manually). Vercel will build the Next.js app and host it. Verify the deployment logs for any errors (especially any build issues or missing env var warnings). 5. Telegram Webhook configuration: Once your app is live on a public URL (e.g. https://your-app-name.vercel.app), set up Telegram to use the webhook:
• Use BotFather or Telegram API to set the webhook. Via API, you can send an HTTPS request:

https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app-name.vercel.app/api/telegram-webhook&secret_token=<YOUR_WEBHOOK_SECRET>

Replace <YOUR_BOT_TOKEN> and <YOUR_WEBHOOK_SECRET> accordingly. This tells Telegram to send updates to your Vercel function endpoint. If it returns {"ok":true}, the webhook is set.

    •	Make sure your bot is not running in polling mode anywhere (only one method at a time). In production, we rely on webhooks.
    •	After setting, you can also use getWebhookInfo (Telegram API method) to verify the webhook status.

    6.	Production Testing: Now test the bot in the live environment:
    •	Send a command (e.g. /help) to ensure the bot responds. If not, check the following: Did the webhook reach our endpoint? (Vercel Functions logs can show if the function was invoked). Common issues could be a wrong secret (Telegram will send updates but our code will 401 reject if secret mismatched). Ensure the secret token in the Telegram setWebhook call exactly matches TELEGRAM_WEBHOOK_SECRET in Vercel.
    •	Once basic communication works, test /sentiment BTC etc. The first call may take a bit if Hugging Face models are spinning up, but subsequent calls should be faster (and cached).
    •	Monitor your Supabase dashboard to see if entries are being created in the cache tables as you use the bot or API. This confirms caching is working in production.
    •	If something fails (e.g., no response), use Vercel’s “Functions” tab to see logs or errors for the function calls. Also check Telegram’s response in BotFather (it might show last error).
    7.	Performance considerations: On Vercel’s Hobby plan, serverless functions have a 10-second execution limit. Our worst-case calls (comprehensive 30s timeout) may not complete in time. If you notice timeouts (no response and logs show function timed out), consider:
    •	Upgrading plan or optimizing model speed (maybe using smaller models or summarizing tasks).
    •	As a workaround for long tasks, you could respond immediately with a message like “analysis will be sent shortly” and perform the operation asynchronously then send via Telegram API separately. But that adds complexity. For now, ensure models typically respond within ~5-10s.
    •	The caching helps because subsequent calls will be very fast (DB query is quick).
    8.	Scalability: If usage grows, Supabase should handle the simple queries easily, and Hugging Face inference can be scaled by using paid inference endpoints or hosting your model on a dedicated server. The modular design (services) makes it easy to swap implementations if needed (for example, if you later host your own model server, just update aiService URLs and maybe switch to an SDK).

c. Post-deployment:
• Monitor logs and set up alerts if possible (for example, if Hugging Face calls start failing due to rate limits, you might need to implement exponential backoff or caching of “error state” for a short time to avoid spamming requests).
• Engage with some test users (or yourself from another Telegram account) to simulate usage patterns and see if any unusual behavior occurs (memory leaks are not likely since each request is stateless on serverless; but watch out for any unhandled promise rejections in logs).
• Keep your environment variables up to date. For instance, if you update to a new model version on Hugging Face with a different URL, update the env var rather than hardcoding.

Finally, you have a fully functional AI-powered backend for your trading bot! By following the steps and using AI assistants to speed up development, you integrated advanced features in a structured, secure, and scalable manner.

Feel free to extend this setup further – for example, scheduling periodic analysis, adding more commands, or integrating a front-end dashboard that calls the same API endpoints for a web UI. The architecture we implemented (Next.js API + service modules + caching + Telegram integration) provides a solid foundation for many future enhancements. Good luck and happy coding!
