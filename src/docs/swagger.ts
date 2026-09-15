import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Job Tracker API',
    version: '1.0.0',
    description: 'Type-safe REST API for managing and tracking job applications built with Express.js and Prisma 8.',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local development server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token obtained from /auth/login',
      },
    },
    schemas: {
      SignupRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', minLength: 8, example: 'SecurePassword123' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', example: 'SecurePassword123' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        },
      },
      Application: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          company: { type: 'string', example: 'Google' },
          role: { type: 'string', example: 'Backend Engineer' },
          status: {
            type: 'string',
            enum: ['Applied', 'Interviewing', 'Offered', 'Rejected', 'Accepted', 'Withdrawn'],
            example: 'Applied',
          },
          appliedDate: { type: 'string', format: 'date-time', example: '2026-09-01T10:30:00.000Z' },
          userId: { type: 'integer', example: 1 },
        },
      },
      CreateApplicationRequest: {
        type: 'object',
        required: ['company', 'role'],
        properties: {
          company: { type: 'string', example: 'Google' },
          role: { type: 'string', example: 'Backend Engineer' },
          status: {
            type: 'string',
            enum: ['Applied', 'Interviewing', 'Offered', 'Rejected', 'Accepted', 'Withdrawn'],
            default: 'Applied',
            example: 'Applied',
          },
        },
      },
      UpdateApplicationRequest: {
        type: 'object',
        properties: {
          company: { type: 'string', example: 'Google LLC' },
          role: { type: 'string', example: 'Senior Backend Engineer' },
          status: {
            type: 'string',
            enum: ['Applied', 'Interviewing', 'Offered', 'Rejected', 'Accepted', 'Withdrawn'],
            example: 'Interviewing',
          },
        },
      },
      PaginatedApplicationsResponse: {
        type: 'object',
        properties: {
          applications: {
            type: 'array',
            items: { $ref: '#/components/schemas/Application' },
          },
          nextCursor: { type: 'integer', nullable: true, example: 5 },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Invalid credentials or resource not found' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        description: 'Verify server operational status',
        tags: ['Health'],
        responses: {
          200: {
            description: 'Server is running',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { status: { type: 'string', example: 'ok' } },
                },
              },
            },
          },
        },
      },
    },
    '/auth/signup': {
      post: {
        summary: 'Register new user',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SignupRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'User registered successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer', example: 1 },
                    email: { type: 'string', example: 'user@example.com' },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation failed or email already registered',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Log in and receive JWT token',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          401: {
            description: 'Invalid credentials',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          429: {
            description: 'Too many login attempts (rate limited)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/applications': {
      get: {
        summary: 'List user applications',
        description: 'Returns applications owned by the authenticated user with cursor pagination and filtering.',
        tags: ['Applications'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 }, description: 'Number of results to return' },
          { name: 'cursor', in: 'query', schema: { type: 'integer' }, description: 'Pagination cursor ID' },
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status (e.g. Applied, Interviewing)' },
          { name: 'company', in: 'query', schema: { type: 'string' }, description: 'Search company name (case-insensitive substring)' },
        ],
        responses: {
          200: {
            description: 'List of applications',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedApplicationsResponse' },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Create a new application',
        tags: ['Applications'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateApplicationRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Application created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Application' },
              },
            },
          },
          400: { description: 'Validation error' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/applications/{id}': {
      get: {
        summary: 'Get application by ID',
        tags: ['Applications'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Application details',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Application' } } },
          },
          403: { description: 'Forbidden (not owner)' },
          404: { description: 'Not found' },
        },
      },
      patch: {
        summary: 'Update application',
        tags: ['Applications'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateApplicationRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Application updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Application' } } },
          },
          400: { description: 'Validation error' },
          403: { description: 'Forbidden' },
          404: { description: 'Not found' },
        },
      },
      delete: {
        summary: 'Delete application',
        tags: ['Applications'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          204: { description: 'Application deleted successfully' },
          403: { description: 'Forbidden' },
          404: { description: 'Not found' },
        },
      },
    },
    '/export/csv': {
      get: {
        summary: 'Export applications as CSV',
        description: 'Streams application data in CSV format for download.',
        tags: ['Export'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'CSV file download',
            content: {
              'text/csv': {
                schema: { type: 'string', example: 'id,company,role,status,appliedDate\n1,"Google","Backend Engineer","Applied",2026-09-01T10:30:00.000Z' },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/admin/stats': {
      get: {
        summary: 'Get user application statistics',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Aggregated user statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      email: { type: 'string' },
                      applications: {
                        type: 'object',
                        properties: {
                          totalApplications: { type: 'integer' },
                          lastAppliedAt: { type: 'string', format: 'date-time', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
  },
};

export function setupSwagger(app: Express) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
