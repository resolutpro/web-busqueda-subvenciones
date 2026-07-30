import { z } from 'zod';
import { insertCompanySchema, insertGrantSchema, companies, grants, grantMatches, insertGrantMatchSchema } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  companies: {
    list: {
      method: 'GET' as const,
      path: '/api/companies' as const,
      responses: {
        200: z.array(z.custom<typeof companies.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/companies/me' as const,
      responses: {
        200: z.custom<typeof companies.$inferSelect>(),
        404: z.null(), // Not found means user hasn't created profile yet
        401: errorSchemas.unauthorized,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/companies' as const,
      input: insertCompanySchema,
      responses: {
        201: z.custom<typeof companies.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/companies/:id' as const,
      input: insertCompanySchema.partial(),
      responses: {
        200: z.custom<typeof companies.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
  },
  grants: {
    list: {
      method: 'GET' as const,
      path: '/api/grants' as const,
      input: z.object({
        search: z.string().optional(),
        source: z.string().optional(),
        reviewStatus: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof grants.$inferSelect & { match?: typeof grantMatches.$inferSelect }>()),
        401: errorSchemas.unauthorized,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/grants/:id' as const,
      responses: {
        200: z.custom<typeof grants.$inferSelect & { match?: typeof grantMatches.$inferSelect }>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    // Admin only - theoretically
    create: {
      method: 'POST' as const,
      path: '/api/grants' as const,
      input: insertGrantSchema,
      responses: {
        201: z.custom<typeof grants.$inferSelect>(),
        400: errorSchemas.validation,
      },
    }
  },
  matches: {
    list: {
      method: 'GET' as const,
      path: '/api/matches' as const,
      responses: {
        200: z.array(z.custom<typeof grantMatches.$inferSelect & { grant: typeof grants.$inferSelect }>()),
        401: errorSchemas.unauthorized,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/matches/:id' as const,
      input: z.object({
        status: z.string(), // We don't have status on grantMatches anymore, but I'll change it later if needed
      }),
      responses: {
        200: z.custom<typeof grantMatches.$inferSelect>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
