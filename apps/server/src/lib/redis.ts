import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (redisInstance !== null) {
    return redisInstance;
  }

  redisInstance = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      logger.warn({ times, delay }, 'Redis connection retry');
      return delay;
    },
  });

  redisInstance.on('connect', () => {
    logger.info('Redis connected');
  });

  redisInstance.on('error', (err: Error) => {
    logger.error({ err: err.message }, 'Redis connection error');
  });

  redisInstance.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return redisInstance;
}

export async function closeRedis(): Promise<void> {
  if (redisInstance !== null) {
    await redisInstance.quit();
    redisInstance = null;
    logger.info('Redis disconnected');
  }
}
