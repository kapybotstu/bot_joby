/**
 * Enhanced logging utility for Firebase operations
 * Helps track connections, queries, and performance issues
 */

// Log levels for different types of messages
export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG'
}

// Interface for log entry with timestamps
export interface LogEntry {
timestamp: string;
level: LogLevel;
category: string;
message: string;
data?: any;
}

export class FirebaseLogger {
private static instance: FirebaseLogger;
private logs: LogEntry[] = [];
private maxLogs: number = 1000;
private logToConsole: boolean = true;
private logLevel: LogLevel = LogLevel.INFO;

// Make constructor private to enforce singleton pattern
private constructor() {}

// Get singleton instance
public static getInstance(): FirebaseLogger {
  if (!FirebaseLogger.instance) {
    FirebaseLogger.instance = new FirebaseLogger();
  }
  return FirebaseLogger.instance;
}

// Configure logger settings
public configure({
  maxLogs = 1000,
  logToConsole = true,
  logLevel = LogLevel.INFO
}: {
  maxLogs?: number;
  logToConsole?: boolean;
  logLevel?: LogLevel;
}): void {
  this.maxLogs = maxLogs;
  this.logToConsole = logToConsole;
  this.logLevel = logLevel;
}

// Log an event with specified level
public log(level: LogLevel, category: string, message: string, data?: any): void {
  // Check if we should log this level
  if (!this.shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    data
  };

  // Add to in-memory logs
  this.logs.push(entry);

  // Trim logs if exceeding maximum
  if (this.logs.length > this.maxLogs) {
    this.logs = this.logs.slice(-this.maxLogs);
  }

  // Output to console if enabled
  if (this.logToConsole) {
    this.outputToConsole(entry);
  }
}

// Helper methods for different log levels
public error(category: string, message: string, data?: any): void {
  this.log(LogLevel.ERROR, category, message, data);
}

public warn(category: string, message: string, data?: any): void {
  this.log(LogLevel.WARN, category, message, data);
}

public info(category: string, message: string, data?: any): void {
  this.log(LogLevel.INFO, category, message, data);
}

public debug(category: string, message: string, data?: any): void {
  this.log(LogLevel.DEBUG, category, message, data);
}

// Get all logs
public getLogs(): LogEntry[] {
  return [...this.logs];
}

// Get filtered logs
public getFilteredLogs(options: {
  level?: LogLevel;
  category?: string;
  since?: Date;
}): LogEntry[] {
  return this.logs.filter(log => {
    let include = true;
    
    if (options.level && log.level !== options.level) {
      include = false;
    }
    
    if (options.category && log.category !== options.category) {
      include = false;
    }
    
    if (options.since && new Date(log.timestamp) < options.since) {
      include = false;
    }
    
    return include;
  });
}

// Clear all logs
public clearLogs(): void {
  this.logs = [];
}

// Utility to create a formatted performance measurement
public async measurePerformance<T>(
  category: string, 
  operation: string, 
  fn: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();
  try {
    this.debug(category, `Starting operation: ${operation}`);
    const result = await fn();
    const duration = performance.now() - startTime;
    this.info(category, `Completed operation: ${operation} in ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    this.error(category, `Failed operation: ${operation} after ${duration.toFixed(2)}ms`, { error });
    throw error;
  }
}

// Private helper to check if we should log at this level
private shouldLog(level: LogLevel): boolean {
  const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
  const currentLevelIndex = levels.indexOf(this.logLevel);
  const messageLevelIndex = levels.indexOf(level);
  
  return messageLevelIndex <= currentLevelIndex;
}

// Format and output log entry to console
private outputToConsole(entry: LogEntry): void {
  const timestamp = entry.timestamp.split('T')[1].split('.')[0]; // HH:MM:SS format
  
  // Format based on log level
  switch (entry.level) {
    case LogLevel.ERROR: {
      console.error(`🔴 ${timestamp} [${entry.category}] ${entry.message}`);
      if (entry.data) console.error(entry.data);
      break;
    }
    case LogLevel.WARN: {
      console.warn(`🟠 ${timestamp} [${entry.category}] ${entry.message}`);
      if (entry.data) console.warn(entry.data);
      break;
    }
    case LogLevel.INFO: {
      console.log(`🔵 ${timestamp} [${entry.category}] ${entry.message}`);
      if (entry.data) console.log(entry.data);
      break;
    }
    case LogLevel.DEBUG: {
      console.log(`⚪ ${timestamp} [${entry.category}] ${entry.message}`);
      if (entry.data) console.log(entry.data);
      break;
    }
  }
}
}

// Export default singleton instance
const logger = FirebaseLogger.getInstance();
export default logger;