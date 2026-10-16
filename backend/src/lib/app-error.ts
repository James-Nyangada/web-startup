import { ErrorCode } from '../shared/errors.js';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message = 'Not found.') {
    return new AppError(404, ErrorCode.NOT_FOUND, message);
  }

  static validation(message: string, details: Record<string, unknown> = {}) {
    return new AppError(400, ErrorCode.VALIDATION_ERROR, message, details);
  }
}
