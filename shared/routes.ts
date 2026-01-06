import { z } from 'zod';
import { 
  insertStockSchema, 
  insertIndustrySchema, 
  insertAccountSchema, 
  insertQueueSchema, 
  insertConfigSchema,
  stocks,
  industries,
  geminiAccounts,
  extractionQueue,
  knowledgeGraphs,
  systemConfig,
  activityLogs
} from './schema';

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
  })
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/login',
      input: z.object({
        email: z.string().email(),
        password: z.string()
      }),
      responses: {
        200: z.object({ message: z.string() }),
        401: errorSchemas.unauthorized
      }
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout',
      responses: {
        200: z.object({ message: z.string() })
      }
    },
    me: {
      method: 'GET' as const,
      path: '/api/user',
      responses: {
        200: z.object({ email: z.string() }),
        401: errorSchemas.unauthorized
      }
    }
  },
  stocks: {
    list: {
      method: 'GET' as const,
      path: '/api/stocks',
      responses: {
        200: z.array(z.custom<typeof stocks.$inferSelect>())
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/stocks',
      input: insertStockSchema,
      responses: {
        201: z.custom<typeof stocks.$inferSelect>(),
        400: errorSchemas.validation
      }
    }
  },
  industries: {
    list: {
      method: 'GET' as const,
      path: '/api/industries',
      responses: {
        200: z.array(z.custom<typeof industries.$inferSelect>())
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/industries',
      input: insertIndustrySchema,
      responses: {
        201: z.custom<typeof industries.$inferSelect>(),
        400: errorSchemas.validation
      }
    }
  },
  accounts: {
    list: {
      method: 'GET' as const,
      path: '/api/accounts',
      responses: {
        200: z.array(z.custom<typeof geminiAccounts.$inferSelect>())
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/accounts',
      input: insertAccountSchema,
      responses: {
        201: z.custom<typeof geminiAccounts.$inferSelect>(),
        400: errorSchemas.validation
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/accounts/:id',
      responses: {
        200: z.void(),
        404: errorSchemas.notFound
      }
    }
  },
  queue: {
    list: {
      method: 'GET' as const,
      path: '/api/queue',
      responses: {
        200: z.array(z.custom<typeof extractionQueue.$inferSelect>())
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/queue',
      input: insertQueueSchema,
      responses: {
        201: z.custom<typeof extractionQueue.$inferSelect>(),
        400: errorSchemas.validation
      }
    },
    control: {
      method: 'POST' as const,
      path: '/api/queue/control',
      input: z.object({ action: z.enum(['start', 'stop']) }),
      responses: {
        200: z.object({ status: z.string() })
      }
    }
  },
  kgs: {
    list: {
      method: 'GET' as const,
      path: '/api/kgs',
      responses: {
        200: z.array(z.custom<typeof knowledgeGraphs.$inferSelect>())
      }
    }
  },
  config: {
    list: {
      method: 'GET' as const,
      path: '/api/config',
      responses: {
        200: z.array(z.custom<typeof systemConfig.$inferSelect>())
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/config',
      input: z.object({
        key: z.string(),
        value: z.string()
      }),
      responses: {
        200: z.custom<typeof systemConfig.$inferSelect>()
      }
    }
  },
  logs: {
    list: {
      method: 'GET' as const,
      path: '/api/logs',
      responses: {
        200: z.array(z.custom<typeof activityLogs.$inferSelect>())
      }
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
