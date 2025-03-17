import { join } from 'path';
import { createBot, createProvider, createFlow } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { BaileysProvider as Provider } from '@builderbot/provider-baileys';
import logger, { LogLevel } from './tools/firebase-logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Importar el sistema multi-modelo
import MultiModelHandler from './ai/multi-model-handler';
import GeminiAdapter from './ai/gemini-adapter';

// Constants for logging categories
const LOG_CATEGORY = {
  STARTUP: 'Startup',
  WEBHOOK: 'Webhook',
  MESSAGE: 'Message',
  SYSTEM: 'System',
  AI: 'AI'
};

// Configuration
const PORT = process.env.PORT ?? 3008;
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const LOG_TO_FILE = process.env.LOG_TO_FILE === 'true';
const LOG_DIRECTORY = process.env.LOG_DIRECTORY || path.join(os.homedir(), 'marcelo-bot-logs');
const USE_GEMINI = process.env.USE_GEMINI === 'true';

// Setup logging level based on debug mode
if (DEBUG_MODE) {
  logger.configure({ logLevel: LogLevel.DEBUG });
} else {
  logger.configure({ logLevel: LogLevel.INFO });
}

// Setup file logging if enabled
if (LOG_TO_FILE) {
  try {
    // Ensure log directory exists
    if (!fs.existsSync(LOG_DIRECTORY)) {
      fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
    }
    
    // Create a write stream for logs
    const logFilePath = path.join(LOG_DIRECTORY, `bot-log-${new Date().toISOString().split('T')[0]}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    
    // Override console methods to also write to file
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    console.log = function(...args) {
      originalConsoleLog.apply(console, args);
      logStream.write(args.join(' ') + '\n');
    };
    
    console.error = function(...args) {
      originalConsoleError.apply(console, args);
      logStream.write('[ERROR] ' + args.join(' ') + '\n');
    };
    
    console.warn = function(...args) {
      originalConsoleWarn.apply(console, args);
      logStream.write('[WARN] ' + args.join(' ') + '\n');
    };
    
    logger.info(LOG_CATEGORY.STARTUP, `Logging to file enabled at ${logFilePath}`);
  } catch (error) {
    logger.error(LOG_CATEGORY.STARTUP, 'Failed to setup file logging', { error });
  }
}

// Check environment variables
logger.info(LOG_CATEGORY.STARTUP, "Checking environment configuration");

// Check OpenAI API Key
if (!process.env.OPENAI_API_KEY) {
  logger.warn(LOG_CATEGORY.STARTUP, "OPENAI_API_KEY not configured in environment variables");
} else {
  // Mask API key in logs
  const maskedKey = process.env.OPENAI_API_KEY.substring(0, 4) + '...' + 
                    process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 4);
  logger.info(LOG_CATEGORY.STARTUP, `OPENAI_API_KEY configured with key starting with ${maskedKey}`);
}

// Check Gemini API Key
if (USE_GEMINI && !process.env.GEMINI_API_KEY) {
  logger.warn(LOG_CATEGORY.STARTUP, "GEMINI_API_KEY not configured but USE_GEMINI is set to true");
} else if (USE_GEMINI) {
  const maskedGeminiKey = process.env.GEMINI_API_KEY!.substring(0, 4) + '...' + 
                          process.env.GEMINI_API_KEY!.substring(process.env.GEMINI_API_KEY!.length - 4);
  logger.info(LOG_CATEGORY.STARTUP, `GEMINI_API_KEY configured with key starting with ${maskedGeminiKey}`);
}

// Check Firebase configuration
if (!process.env.FIREBASE_API_KEY) {
  logger.warn(LOG_CATEGORY.STARTUP, "Firebase variables not configured in environment");
}

// ChatGPT configuration
const gptConfig = {
  apiKey: process.env.OPENAI_API_KEY || '', 
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '10024'),
  temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7')
};

// Gemini configuration
const geminiConfig = {
  apiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '8192'),
  temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.2')
};

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBxCG7lyozYa39DTd6HjwkbzcR9NMCKHKM",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "marcelo-7ffd6.firebaseapp.com",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://marcelo-7ffd6-default-rtdb.firebaseio.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "marcelo-7ffd6",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "marcelo-7ffd6.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "47968922450",
  appId: process.env.FIREBASE_APP_ID || "1:47968922450:web:c15bc71228c925f078e88b",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-22T1DW5T69"
};

// System stats
const startTime = Date.now();
let messageCount = 0;
let errorCount = 0;
let lastMessageTime = 0;
let slowestResponseTime = 0;
let averageResponseTime = 0;
let totalResponseTime = 0;

// Initialize AI handler based on configuration
let aiHandler;

if (USE_GEMINI && process.env.GEMINI_API_KEY) {
  logger.info(LOG_CATEGORY.STARTUP, "Initializing Multi-Model system with Gemini + ChatGPT");
  aiHandler = new MultiModelHandler(
    geminiConfig,
    gptConfig,
    firebaseConfig,
    true, // Use local storage
    DEBUG_MODE
  );
} else {
  logger.info(LOG_CATEGORY.STARTUP, "Initializing Gemini Adapter with fallback to ChatGPT");
  aiHandler = new GeminiAdapter(
    geminiConfig,
    gptConfig,
    firebaseConfig,
    true, // Use local storage
    DEBUG_MODE
  );
}

const main = async () => {
  logger.info(LOG_CATEGORY.STARTUP, "Starting the bot...");
  
  const adapterProvider = createProvider(Provider);
  const adapterDB = new Database();

  // Create an empty flow - we won't have predefined flows
  const adapterFlow = createFlow([]);
  
  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  });

  // Verify connection and configuration
  try {
    logger.info(LOG_CATEGORY.STARTUP, "Checking AI model configuration");
    
    // Verificar si el sistema está conectado a Firebase
    if (aiHandler.isConnected()) {
      logger.info(LOG_CATEGORY.STARTUP, "Firebase connected successfully");
    } else {
      logger.warn(LOG_CATEGORY.STARTUP, "Firebase not connected. Using local storage as fallback");
    }

    logger.info(LOG_CATEGORY.STARTUP, "AI system initialized successfully");
  } catch (error) {
    logger.error(LOG_CATEGORY.STARTUP, "Error during initial verification", { error });
  }

  // Intercept all messages and process them with the AI handler
  adapterProvider.on('message', async (ctx) => {
    // Update message stats
    messageCount++;
    lastMessageTime = Date.now();
    
    // Ignore empty messages or only spaces
    if (!ctx.body || ctx.body.trim() === '') return;
    
    const messageStartTime = Date.now();
    logger.info(LOG_CATEGORY.MESSAGE, `Message received from ${ctx.from}`, {
      messageId: ctx.id,
      messageLength: ctx.body.length,
      messagePreview: ctx.body.substring(0, 50) + (ctx.body.length > 50 ? '...' : '')
    });
    
    // Process message with AI handler
    try {
      // Process message
      const response = await aiHandler.processMessage(ctx.body, ctx.from);
      
      // Send response to user
      await adapterProvider.sendMessage(ctx.from, response, {});
      
      // Calculate and update timing metrics
      const responseTime = Date.now() - messageStartTime;
      totalResponseTime += responseTime;
      averageResponseTime = totalResponseTime / messageCount;
      
      if (responseTime > slowestResponseTime) {
        slowestResponseTime = responseTime;
      }
      
      logger.info(LOG_CATEGORY.MESSAGE, `Response sent to ${ctx.from}`, {
        messageId: ctx.id,
        responseLength: response.length,
        responseTime: responseTime
      });
    } catch (error) {
      errorCount++;
      logger.error(LOG_CATEGORY.MESSAGE, `Error processing message from ${ctx.from}`, {
        messageId: ctx.id,
        error: error.message,
        stack: error.stack
      });
      
      // Send error message to user
      await adapterProvider.sendMessage(
        ctx.from, 
        "Lo siento, ocurrió un error procesando tu mensaje. Por favor, intenta nuevamente en unos momentos.",
        {}
      );
    }
  });

  // API endpoints
  adapterProvider.server.post(
    '/v1/messages',
    handleCtx(async (bot, req, res) => {
      const { number, message, urlMedia } = req.body;
      logger.info(LOG_CATEGORY.WEBHOOK, 'API message request received', {
        number,
        messageLength: message.length,
        hasMedia: !!urlMedia
      });
      
      await bot.sendMessage(number, message, { media: urlMedia ?? null });
      return res.end('sent');
    })
  );

  adapterProvider.server.post(
    '/v1/ai',
    handleCtx(async (bot, req, res) => {
      const { number, message } = req.body;
      logger.info(LOG_CATEGORY.WEBHOOK, 'AI endpoint request received', {
        number,
        messageLength: message.length
      });
      
      try {
        // Process message with AI handler
        const startTime = Date.now();
        const response = await aiHandler.processMessage(message, number);
        const processingTime = Date.now() - startTime;
        
        // Send response
        await bot.sendMessage(number, response);
        
        logger.info(LOG_CATEGORY.WEBHOOK, 'AI request processed successfully', {
          responseTime: processingTime
        });
        
        return res.end(JSON.stringify({ 
          success: true, 
          message: response,
          performance: { processingTime }
        }));
      } catch (error: any) {
        logger.error(LOG_CATEGORY.WEBHOOK, 'Error in /v1/ai endpoint', {
          error: error.message,
          stack: error.stack
        });
        
        res.status(500).json({
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    })
  );

  // Maintain backward compatibility with chatgpt endpoint
  adapterProvider.server.post(
    '/v1/chatgpt',
    handleCtx(async (bot, req, res) => {
      const { number, message } = req.body;
      logger.info(LOG_CATEGORY.WEBHOOK, 'ChatGPT endpoint request received (legacy)', {
        number,
        messageLength: message.length
      });
      
      try {
        // Process message with AI handler (same as /v1/ai)
        const startTime = Date.now();
        const response = await aiHandler.processMessage(message, number);
        const processingTime = Date.now() - startTime;
        
        // Send response
        await bot.sendMessage(number, response);
        
        logger.info(LOG_CATEGORY.WEBHOOK, 'ChatGPT request processed successfully', {
          responseTime: processingTime
        });
        
        return res.end(JSON.stringify({ 
          success: true, 
          message: response,
          performance: { processingTime }
        }));
      } catch (error: any) {
        logger.error(LOG_CATEGORY.WEBHOOK, 'Error in /v1/chatgpt endpoint', {
          error: error.message,
          stack: error.stack
        });
        
        res.status(500).json({
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    })
  );

  // System diagnostics and statistics endpoint
  adapterProvider.server.get(
    '/v1/diagnostics',
    (req, res) => {
      try {
        const uptime = Date.now() - startTime;
        const aiStats = aiHandler.getPerformanceStats?.() || { connectionStatus: aiHandler.isConnected() };
        
        const diagnostics = {
          system: {
            uptime: uptime,
            uptimeFormatted: formatUptime(uptime),
            startTime: new Date(startTime).toISOString(),
            messageCount,
            errorCount,
            lastMessageTime: lastMessageTime ? new Date(lastMessageTime).toISOString() : null,
            lastMessageAge: lastMessageTime ? Date.now() - lastMessageTime : null,
            averageResponseTime,
            slowestResponseTime,
            memoryUsage: process.memoryUsage(),
          },
          ai: {
            provider: USE_GEMINI ? 'multi-model' : 'gemini-adapter',
            stats: aiStats
          },
          environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            debugMode: DEBUG_MODE,
            openaiModel: gptConfig.model,
            geminiModel: geminiConfig.model,
            useGemini: USE_GEMINI
          }
        };
        
        res.status(200).json(diagnostics);
      } catch (error: any) {
        logger.error(LOG_CATEGORY.WEBHOOK, 'Error in /v1/diagnostics endpoint', {
          error: error.message,
          stack: error.stack
        });
        
        res.status(500).json({
          success: false,
          error: error.message || 'Error generating diagnostics'
        });
      }
    }
  );

  // Logs endpoint
  adapterProvider.server.get(
    '/v1/logs',
    (req, res) => {
      try {
        // Get optional filter parameters
        const level = req.query.level as string || undefined;
        const category = req.query.category as string || undefined;
        const limit = parseInt(req.query.limit as string || '100');
        
        // Get logs from logger
        const logs = logger.getLogs();
        
        // Apply filters
        let filteredLogs = logs;
        
        if (level) {
          filteredLogs = filteredLogs.filter(log => log.level === level);
        }
        
        if (category) {
          filteredLogs = filteredLogs.filter(log => log.category.includes(category));
        }
        
        // Get the most recent logs up to the limit
        const recentLogs = filteredLogs.slice(-limit);
        
        res.status(200).json({
          count: recentLogs.length,
          total: logs.length,
          logs: recentLogs
        });
      } catch (error: any) {
        logger.error(LOG_CATEGORY.WEBHOOK, 'Error in /v1/logs endpoint', {
          error: error.message,
          stack: error.stack
        });
        
        res.status(500).json({
          success: false,
          error: error.message || 'Error retrieving logs'
        });
      }
    }
  );

  // Blacklist endpoint
  adapterProvider.server.post(
    '/v1/blacklist',
    handleCtx(async (bot, req, res) => {
      const { number, intent } = req.body;
      logger.info(LOG_CATEGORY.WEBHOOK, 'Blacklist modification request', {
        number,
        intent
      });
      
      if (intent === 'remove') bot.blacklist.remove(number);
      if (intent === 'add') bot.blacklist.add(number);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', number, intent }));
    })
  );

  // Start HTTP server
  httpServer(+PORT);
  logger.info(LOG_CATEGORY.STARTUP, `HTTP server started on port ${PORT}`);
  logger.info(LOG_CATEGORY.STARTUP, "Bot is ready to receive messages!");
};

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  logger.error(LOG_CATEGORY.SYSTEM, 'Unhandled rejection', { error });
});

process.on('uncaughtException', (error) => {
  logger.error(LOG_CATEGORY.SYSTEM, 'Uncaught exception', { error });
});

// Utility to format uptime in a human-readable way
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;
  
  let result = '';
  if (days > 0) result += `${days}d `;
  if (remainingHours > 0) result += `${remainingHours}h `;
  if (remainingMinutes > 0) result += `${remainingMinutes}m `;
  result += `${remainingSeconds}s`;
  
  return result;
}

// Start the application
main().catch(error => {
  logger.error(LOG_CATEGORY.STARTUP, 'Fatal error during bot startup', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});