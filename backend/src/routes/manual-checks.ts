import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { MANUAL_CHECK_RESULTS, MANUAL_CHECK_TYPES } from '../db/schema/index.js';
import { requireOrgRole, enforceSiteAccess } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import type { StorageService } from '../storage/index.js';
import {
  detectAttachmentType,
  signAttachmentDownloadToken,
  verifyAttachmentDownloadToken,
} from '../manual-checks/token.js';

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

const createManualCheckSchema = z.object({
  checkType: z.enum(MANUAL_CHECK_TYPES),
  performedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD.'),
  performedByName: z.string().trim().min(1, 'Tester name is required.').max(100),
  tool: z.string().trim().min(1, 'Tool is required.').max(200),
  result: z.enum(MANUAL_CHECK_RESULTS),
  notes: z.string().max(10000).optional().default(''),
});

const updateManualCheckSchema = z.object({
  checkType: z.enum(MANUAL_CHECK_TYPES).optional(),
  performedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD.')
    .optional(),
  performedByName: z.string().trim().min(1).max(100).optional(),
  tool: z.string().trim().min(1).max(200).optional(),
  result: z.enum(MANUAL_CHECK_RESULTS).optional(),
  notes: z.string().max(10000).optional(),
  removeAttachment: z.boolean().optional(),
});

const listManualChecksQuerySchema = z.object({
  checkType: z.enum(MANUAL_CHECK_TYPES).optional(),
  result: z.enum(MANUAL_CHECK_RESULTS).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

interface ParsedRequestData {
  fields: Record<string, string>;
  file?: {
    buffer: Buffer;
    filename: string;
  };
}

async function parseMultipartOrJson(req: Request): Promise<ParsedRequestData> {
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('multipart/form-data')) {
    const init: Record<string, unknown> = {
      method: req.method,
      headers: req.headers,
      body: req,
      duplex: 'half',
    };
    const webReq = new Request(`http://localhost${req.originalUrl || req.url}`, init);
    const formData = await webReq.formData();
    const fields: Record<string, string> = {};
    let fileObj: { buffer: Buffer; filename: string } | undefined;

    for (const [key, val] of formData.entries()) {
      if (typeof val === 'string') {
        fields[key] = val;
      } else if (val && typeof val === 'object' && 'arrayBuffer' in val) {
        const blob = val as Blob & { name?: string };
        const arrayBuf = await blob.arrayBuffer();
        if (arrayBuf.byteLength > 0) {
          fileObj = {
            buffer: Buffer.from(arrayBuf),
            filename: blob.name || 'attachment',
          };
        }
      }
    }
    return { fields, file: fileObj };
  }

  // Fallback to json body
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
    string,
    unknown
  >;
  const fields: Record<string, string> = {};
  let fileObj: { buffer: Buffer; filename: string } | undefined;

  for (const [k, v] of Object.entries(body)) {
    if (k === 'attachmentBase64' && typeof v === 'string') {
      const buf = Buffer.from(v, 'base64');
      fileObj = {
        buffer: buf,
        filename:
          typeof body.attachmentFilename === 'string' ? body.attachmentFilename : 'attachment',
      };
    } else if (typeof v === 'string') {
      fields[k] = v;
    } else if (typeof v === 'boolean') {
      fields[k] = String(v);
    }
  }

  return { fields, file: fileObj };
}

export function orgManualChecksRouter(repos: Repositories, storage: StorageService): Router {
  const router = Router({ mergeParams: true });

  // 1. GET /v1/orgs/:orgId/sites/:siteId/manual-checks (O A M C)
  router.get(
    '/:siteId/manual-checks',
    requireOrgRole('client_viewer'),
    enforceSiteAccess,
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const siteIdParam = req.params.siteId;
      const siteId = Array.isArray(siteIdParam) ? siteIdParam[0] : siteIdParam;

      if (!siteId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Site ID is required.',
            details: {},
          },
        });
        return;
      }

      const site = await repos.sites.findById(orgId, siteId);
      if (!site) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
            details: {},
          },
        });
        return;
      }

      const parse = listManualChecksQuerySchema.safeParse(req.query);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid query parameters.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const { checkType, result, from, to, limit, offset } = parse.data;
      const [checks, total] = await Promise.all([
        repos.manualChecks.listBySite(orgId, siteId, {
          checkType,
          result,
          from,
          to,
          limit,
          offset,
        }),
        repos.manualChecks.countBySite(orgId, siteId, {
          checkType,
          result,
          from,
          to,
        }),
      ]);

      res.status(200).json({
        data: checks,
        total,
        limit,
        offset,
      });
    },
  );

  // 2. POST /v1/orgs/:orgId/sites/:siteId/manual-checks (O A M)
  router.post(
    '/:siteId/manual-checks',
    requireOrgRole('member'),
    enforceSiteAccess,
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const siteIdParam = req.params.siteId;
      const siteId = Array.isArray(siteIdParam) ? siteIdParam[0] : siteIdParam;

      if (!siteId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Site ID is required.',
            details: {},
          },
        });
        return;
      }

      const site = await repos.sites.findById(orgId, siteId);
      if (!site) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
            details: {},
          },
        });
        return;
      }

      let parsed: ParsedRequestData;
      try {
        parsed = await parseMultipartOrJson(req);
      } catch (err) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Failed to parse request data.',
            details: { error: String(err) },
          },
        });
        return;
      }

      const validatedFields = createManualCheckSchema.safeParse(parsed.fields);
      if (!validatedFields.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: validatedFields.error.issues[0]?.message || 'Invalid manual check data.',
            details: { issues: validatedFields.error.issues },
          },
        });
        return;
      }

      let attachmentKey: string | null = null;
      if (parsed.file) {
        if (parsed.file.buffer.length > MAX_ATTACHMENT_SIZE) {
          res.status(400).json({
            error: {
              code: ErrorCode.FILE_TOO_LARGE,
              message: 'Attachment exceeds the 10 MB limit.',
              details: { size: parsed.file.buffer.length, maxSize: MAX_ATTACHMENT_SIZE },
            },
          });
          return;
        }

        const detected = detectAttachmentType(parsed.file.buffer);
        if (!detected) {
          res.status(400).json({
            error: {
              code: ErrorCode.INVALID_FILE_TYPE,
              message: 'Invalid attachment type. Only PDF, PNG, and JPEG files are permitted.',
              details: {},
            },
          });
          return;
        }

        const key = `manual-checks/${orgId}/${siteId}/${crypto.randomUUID()}.${detected.extension}`;
        await storage.putObject(key, parsed.file.buffer, detected.mimeType);
        attachmentKey = key;
      }

      const check = await repos.manualChecks.create(orgId, {
        siteId,
        checkType: validatedFields.data.checkType,
        performedAt: validatedFields.data.performedAt,
        performedByName: validatedFields.data.performedByName,
        tool: validatedFields.data.tool,
        result: validatedFields.data.result,
        notes: validatedFields.data.notes,
        attachmentKey,
        createdBy: req.auth!.user.id,
      });

      // Write to evidence events (append-only)
      await repos.evidenceEvents.record(orgId, {
        siteId,
        type: 'manual_check_logged',
        actorId: req.auth!.user.id,
        occurredAt: new Date(),
        data: {
          checkId: check.id,
          checkType: check.checkType,
          result: check.result,
          tool: check.tool,
          performedByName: check.performedByName,
          performedAt: check.performedAt,
          hasAttachment: Boolean(attachmentKey),
        },
      });

      // Write to audit log
      await repos.auditLog.write(orgId, {
        actorId: req.auth?.user.id ?? null,
        actorType: 'user',
        action: 'manual_check.created',
        targetType: 'manual_check',
        targetId: check.id,
        data: {
          siteId,
          checkType: check.checkType,
          result: check.result,
        },
      });

      res.status(201).json({ data: check });
    },
  );

  return router;
}

/**
 * Top-level /orgs/:orgId/manual-checks router for direct item operations:
 * GET /v1/orgs/:orgId/manual-checks/:id
 * PATCH /v1/orgs/:orgId/manual-checks/:id
 * DELETE /v1/orgs/:orgId/manual-checks/:id
 * GET /v1/orgs/:orgId/manual-checks/:id/attachment
 */
export function orgManualCheckItemRouter(repos: Repositories, storage: StorageService): Router {
  const router = Router({ mergeParams: true });

  // GET /v1/orgs/:orgId/manual-checks/:id (O A M C)
  router.get(
    '/:id',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const checkIdParam = req.params.id;
      const checkId = Array.isArray(checkIdParam) ? checkIdParam[0] : checkIdParam;

      if (!checkId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Manual check ID is required.',
            details: {},
          },
        });
        return;
      }

      const check = await repos.manualChecks.findById(orgId, checkId);
      if (!check) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Manual check not found.',
            details: {},
          },
        });
        return;
      }

      // Check client site access scoping
      if (req.clientSiteIds && !req.clientSiteIds.includes(check.siteId)) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Manual check not found.',
            details: {},
          },
        });
        return;
      }

      res.status(200).json({ data: check });
    },
  );

  // PATCH /v1/orgs/:orgId/manual-checks/:id (O A or Creator)
  router.patch(
    '/:id',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const checkIdParam = req.params.id;
      const checkId = Array.isArray(checkIdParam) ? checkIdParam[0] : checkIdParam;

      if (!checkId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Manual check ID is required.',
            details: {},
          },
        });
        return;
      }

      const check = await repos.manualChecks.findById(orgId, checkId);
      if (!check) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Manual check not found.',
            details: {},
          },
        });
        return;
      }

      // Authorization: Owner, Admin, or the check's creator
      const isOwnerOrAdmin = req.membership?.role === 'owner' || req.membership?.role === 'admin';
      const isCreator = check.createdBy === req.auth!.user.id;
      if (!isOwnerOrAdmin && !isCreator) {
        res.status(403).json({
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'You can only edit manual checks that you created.',
            details: {},
          },
        });
        return;
      }

      let parsed: ParsedRequestData;
      try {
        parsed = await parseMultipartOrJson(req);
      } catch (err) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Failed to parse request data.',
            details: { error: String(err) },
          },
        });
        return;
      }

      const validatedFields = updateManualCheckSchema.safeParse(parsed.fields);
      if (!validatedFields.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message:
              validatedFields.error.issues[0]?.message || 'Invalid manual check update data.',
            details: { issues: validatedFields.error.issues },
          },
        });
        return;
      }

      let attachmentKey: string | null | undefined = undefined;

      if (validatedFields.data.removeAttachment) {
        if (check.attachmentKey) {
          await storage.deleteObject(check.attachmentKey).catch(() => {});
        }
        attachmentKey = null;
      } else if (parsed.file) {
        if (parsed.file.buffer.length > MAX_ATTACHMENT_SIZE) {
          res.status(400).json({
            error: {
              code: ErrorCode.FILE_TOO_LARGE,
              message: 'Attachment exceeds the 10 MB limit.',
              details: { size: parsed.file.buffer.length, maxSize: MAX_ATTACHMENT_SIZE },
            },
          });
          return;
        }

        const detected = detectAttachmentType(parsed.file.buffer);
        if (!detected) {
          res.status(400).json({
            error: {
              code: ErrorCode.INVALID_FILE_TYPE,
              message: 'Invalid attachment type. Only PDF, PNG, and JPEG files are permitted.',
              details: {},
            },
          });
          return;
        }

        if (check.attachmentKey) {
          await storage.deleteObject(check.attachmentKey).catch(() => {});
        }

        const key = `manual-checks/${orgId}/${check.siteId}/${crypto.randomUUID()}.${detected.extension}`;
        await storage.putObject(key, parsed.file.buffer, detected.mimeType);
        attachmentKey = key;
      }

      const updateData: Parameters<typeof repos.manualChecks.update>[2] = {};
      if (validatedFields.data.checkType) updateData.checkType = validatedFields.data.checkType;
      if (validatedFields.data.performedAt)
        updateData.performedAt = validatedFields.data.performedAt;
      if (validatedFields.data.performedByName)
        updateData.performedByName = validatedFields.data.performedByName;
      if (validatedFields.data.tool) updateData.tool = validatedFields.data.tool;
      if (validatedFields.data.result) updateData.result = validatedFields.data.result;
      if (validatedFields.data.notes !== undefined) updateData.notes = validatedFields.data.notes;
      if (attachmentKey !== undefined) updateData.attachmentKey = attachmentKey;

      const updated = await repos.manualChecks.update(orgId, checkId, updateData);

      await repos.auditLog.write(orgId, {
        actorId: req.auth?.user.id ?? null,
        actorType: 'user',
        action: 'manual_check.updated',
        targetType: 'manual_check',
        targetId: check.id,
        data: { changes: Object.keys(updateData) },
      });

      res.status(200).json({ data: updated });
    },
  );

  // DELETE /v1/orgs/:orgId/manual-checks/:id (O A or Creator)
  router.delete(
    '/:id',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const checkIdParam = req.params.id;
      const checkId = Array.isArray(checkIdParam) ? checkIdParam[0] : checkIdParam;

      if (!checkId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Manual check ID is required.',
            details: {},
          },
        });
        return;
      }

      const check = await repos.manualChecks.findById(orgId, checkId);
      if (!check) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Manual check not found.',
            details: {},
          },
        });
        return;
      }

      // Authorization: Owner, Admin, or Creator
      const isOwnerOrAdmin = req.membership?.role === 'owner' || req.membership?.role === 'admin';
      const isCreator = check.createdBy === req.auth!.user.id;
      if (!isOwnerOrAdmin && !isCreator) {
        res.status(403).json({
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'You can only delete manual checks that you created.',
            details: {},
          },
        });
        return;
      }

      // Delete attachment from storage if exists
      if (check.attachmentKey) {
        await storage.deleteObject(check.attachmentKey).catch(() => {});
      }

      // Delete from manual_checks table
      await repos.manualChecks.delete(orgId, checkId);

      // Write to audit log (§5.5)
      await repos.auditLog.write(orgId, {
        actorId: req.auth?.user.id ?? null,
        actorType: 'user',
        action: 'manual_check.deleted',
        targetType: 'manual_check',
        targetId: check.id,
        data: {
          siteId: check.siteId,
          checkType: check.checkType,
          performedByName: check.performedByName,
        },
      });

      // The evidence event stays, marked deleted: true (append-only)
      await repos.evidenceEvents.record(orgId, {
        siteId: check.siteId,
        type: 'manual_check_logged',
        actorId: req.auth?.user.id,
        occurredAt: new Date(),
        data: {
          checkId: check.id,
          deleted: true,
          checkType: check.checkType,
        },
      });

      res.status(200).json({ data: { success: true } });
    },
  );

  // GET /v1/orgs/:orgId/manual-checks/:id/attachment - Get signed download URL or stream file (O A M C)
  router.get(
    '/:id/attachment',
    requireOrgRole('client_viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const checkIdParam = req.params.id;
      const checkId = Array.isArray(checkIdParam) ? checkIdParam[0] : checkIdParam;

      if (!checkId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Manual check ID is required.',
            details: {},
          },
        });
        return;
      }

      const check = await repos.manualChecks.findById(orgId, checkId);
      if (!check) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Manual check not found.',
            details: {},
          },
        });
        return;
      }

      if (req.clientSiteIds && !req.clientSiteIds.includes(check.siteId)) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Manual check not found.',
            details: {},
          },
        });
        return;
      }

      if (!check.attachmentKey) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'No attachment found for this manual check.',
            details: {},
          },
        });
        return;
      }

      const exp = Math.floor(Date.now() / 1000) + 15 * 60; // 15 minutes
      const token = signAttachmentDownloadToken({
        checkId: check.id,
        orgId,
        attachmentKey: check.attachmentKey,
        exp,
      });

      // If direct download requested, stream it
      if (req.query.direct === 'true') {
        const buffer = await storage.getObject(check.attachmentKey);
        if (!buffer) {
          res.status(404).json({
            error: {
              code: ErrorCode.NOT_FOUND,
              message: 'Attachment file could not be read from storage.',
              details: {},
            },
          });
          return;
        }

        const ext = check.attachmentKey.split('.').pop()?.toLowerCase();
        const contentType =
          ext === 'pdf'
            ? 'application/pdf'
            : ext === 'png'
              ? 'image/png'
              : ext === 'jpg' || ext === 'jpeg'
                ? 'image/jpeg'
                : 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        res.setHeader(
          'Content-Disposition',
          `inline; filename="manual-check-${check.id.slice(0, 8)}.${ext || 'dat'}"`,
        );
        res.setHeader('Content-Length', buffer.length);
        res.status(200).send(buffer);
        return;
      }

      res.status(200).json({
        data: {
          downloadUrl: `/v1/manual-checks/download/${token}`,
          expiresAt: new Date(exp * 1000).toISOString(),
        },
      });
    },
  );

  return router;
}

/**
 * Public router for token-signed downloads: mounted at /v1/manual-checks
 */
export function manualChecksPublicRouter(repos: Repositories, storage: StorageService): Router {
  const router = Router();

  // GET /v1/manual-checks/download/:token
  router.get('/download/:token', async (req: Request, res: Response): Promise<void> => {
    const paramToken = req.params.token;
    const token = Array.isArray(paramToken) ? paramToken[0] : paramToken;

    if (!token) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Download token is required.',
          details: {},
        },
      });
      return;
    }

    const payload = verifyAttachmentDownloadToken(token);
    if (!payload) {
      res.status(401).json({
        error: {
          code: ErrorCode.TOKEN_EXPIRED,
          message: 'The download link is invalid or has expired.',
          details: {},
        },
      });
      return;
    }

    const check = await repos.manualChecks.findRawById(payload.checkId);
    if (!check || check.orgId !== payload.orgId || check.attachmentKey !== payload.attachmentKey) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Attachment was not found.',
          details: {},
        },
      });
      return;
    }

    const buffer = await storage.getObject(payload.attachmentKey);
    if (!buffer) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Attachment file could not be read from storage.',
          details: {},
        },
      });
      return;
    }

    const ext = payload.attachmentKey.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'pdf'
        ? 'application/pdf'
        : ext === 'png'
          ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : 'application/octet-stream';

    const filename = `manual-check-${check.id.slice(0, 8)}.${ext || 'dat'}`;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.status(200).send(buffer);
  });

  return router;
}
