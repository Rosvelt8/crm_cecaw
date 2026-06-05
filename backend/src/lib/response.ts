import { Response } from 'express';

export function success(res: Response, data: unknown, status = 200, meta?: unknown) {
  const body: Record<string, unknown> = { success: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

export function created(res: Response, data: unknown, meta?: unknown) {
  return success(res, data, 201, meta);
}

export function noContent(res: Response) {
  return res.status(204).send();
}

export function error(res: Response, message: string, status = 400, errors?: unknown) {
  const body: Record<string, unknown> = { success: false, message };
  if (errors !== undefined) body.errors = errors;
  return res.status(status).json(body);
}
