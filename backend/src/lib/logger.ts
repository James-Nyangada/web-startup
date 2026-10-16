import { pino } from 'pino';
import { env } from '../config/env.js';

const { LOG_LEVEL, NODE_ENV } = env();

export const logger = pino({
  level: NODE_ENV === 'test' ? 'silent' : LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[redacted]',
  },
  ...(NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname' } },
  }),
});
