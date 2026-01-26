import Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  HTTP_CLIENT_BASE_URL: Joi.string().uri().allow('').default(''),
  HTTP_CLIENT_API_KEY: Joi.string().allow('').default(''),
  HTTP_CLIENT_TIMEOUT: Joi.number().integer().min(100).default(10000),
  HTTP_CLIENT_RETRIES: Joi.number().integer().min(0).max(5).default(2),
  CACHE_REDIS_URL: Joi.string().uri().default('redis://localhost:6379'),
  CACHE_TTL_DEFAULT: Joi.number().integer().min(1).default(300),
  CACHE_STALE_TTL: Joi.number().integer().min(0).default(60),
});
