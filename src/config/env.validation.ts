import Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  // Base URL must be origin-only (no path) so proxy routes map 1:1; URI format enforced.
  HTTP_CLIENT_BASE_URL: Joi.string()
    .uri()
    .required()
    .custom((value, helpers) => {
      try {
        const parsed = new URL(value);
        if (parsed.pathname && parsed.pathname !== '/') {
          return helpers.error('any.custom');
        }
        return value;
      } catch {
        return helpers.error('any.custom');
      }
    }, 'Base URL validation')
    .messages({
      'any.custom': 'HTTP_CLIENT_BASE_URL must not include a path',
    }),
  // Optional API key; empty string means "do not inject".
  HTTP_CLIENT_API_KEY: Joi.string().allow('').default(''),
  // Timeout in ms; keep above 100ms to avoid spurious timeouts.
  HTTP_CLIENT_TIMEOUT: Joi.number().integer().min(100).default(10000),
  // Retries only apply to GET requests (see HttpClientService).
  HTTP_CLIENT_RETRIES: Joi.number().integer().min(0).max(5).default(2),
  // Max JSON body size in bytes (default 1MB) enforced by Fastify.
  PROXY_BODY_LIMIT: Joi.number().integer().min(1024).default(1048576),
  // Redis connection URI and cache TTLs in seconds.
  CACHE_REDIS_URL: Joi.string().uri().default('redis://localhost:6379'),
  CACHE_TTL_DEFAULT: Joi.number().integer().min(1).default(300),
  CACHE_STALE_TTL: Joi.number().integer().min(0).default(60),
});
