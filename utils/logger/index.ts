import pino from 'pino';

// Configure the logger based on environment
const loggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
  // Add application name to all logs
  base: { app: 'tradesense-bot' },
};

// Create the logger instance
const logger = pino(loggerConfig);

// Export standardized logging functions
export default {
  /**
   * Log an info message
   * @param message - The message to log
   * @param data - Optional data to include with the log
   */
  info: (message: string, data?: any) => {
    logger.info(data || {}, message);
  },

  /**
   * Log a debug message
   * @param message - The message to log
   * @param data - Optional data to include with the log
   */
  debug: (message: string, data?: any) => {
    logger.debug(data || {}, message);
  },

  /**
   * Log a warning message
   * @param message - The message to log
   * @param data - Optional data to include with the log
   */
  warn: (message: string, data?: any) => {
    logger.warn(data || {}, message);
  },

  /**
   * Log an error message
   * @param message - The message to log
   * @param error - The error to log
   * @param additionalData - Optional additional data to include
   */
  error: (message: string, error?: Error | any, additionalData?: any) => {
    const errorData = {
      ...(additionalData || {}),
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    };

    logger.error(errorData, message);
  },

  /**
   * Log a critical error message
   * @param message - The message to log
   * @param error - The error to log
   * @param additionalData - Optional additional data to include
   */
  fatal: (message: string, error?: Error | any, additionalData?: any) => {
    const errorData = {
      ...(additionalData || {}),
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    };

    logger.fatal(errorData, message);
  },

  /**
   * Create a child logger with the provided bindings
   * @param bindings - Object containing properties to include with all logs
   */
  child: (bindings: Record<string, any>) => {
    const childLogger = logger.child(bindings);

    // Return standardized interface for the child logger
    return {
      info: (message: string, data?: any) => childLogger.info(data || {}, message),
      debug: (message: string, data?: any) => childLogger.debug(data || {}, message),
      warn: (message: string, data?: any) => childLogger.warn(data || {}, message),
      error: (message: string, error?: Error | any, additionalData?: any) => {
        const errorData = {
          ...(additionalData || {}),
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                }
              : error,
        };

        childLogger.error(errorData, message);
      },
      fatal: (message: string, error?: Error | any, additionalData?: any) => {
        const errorData = {
          ...(additionalData || {}),
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                }
              : error,
        };

        childLogger.fatal(errorData, message);
      },
    };
  },
};
