import * as Sentry from '@sentry/node';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error.js';
import { ErrorCode, type ErrorBody } from '../shared/errors.js';

const body = (
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): ErrorBody => ({ error: { code, message, details } });

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(body(ErrorCode.NOT_FOUND, `No route for ${req.method} ${req.path}.`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json(body(err.code, err.message, err.details));
    return;
  }

  if (err instanceof ZodError) {
    const fields = Object.fromEntries(
      err.issues.map((issue) => [issue.path.join('.') || '_', issue.message]),
    );
    res
      .status(400)
      .json(body(ErrorCode.VALIDATION_ERROR, 'Some fields are missing or invalid.', { fields }));
    return;
  }

  // express.json() raises this for malformed bodies.
  if (err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json(body(ErrorCode.INVALID_JSON, 'The request body is not valid JSON.'));
    return;
  }

  if (err instanceof Error && 'type' in err && err.type === 'entity.too.large') {
    res.status(413).json(body(ErrorCode.VALIDATION_ERROR, 'The request body is too large.'));
    return;
  }

  req.log.error({ err }, 'Unhandled error');
  Sentry.captureException(err);
  res.status(500).json(body(ErrorCode.INTERNAL_ERROR, 'Something went wrong on our side.'));
};
