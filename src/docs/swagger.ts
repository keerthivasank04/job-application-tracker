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
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', example: 'user@example.com' },
          name: { type: 'string', nullable: true, example: 'John Doe' },
          linkedinUrl: { type: 'string', nullable: true, example: 'https://linkedin.com/in/johndoe' },
          githubUrl: { type: 'string', nullable: true, example: 'https://github.com/johndoe' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-09-01T10:00:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-09-01T10:00:00.000Z' },
        },
      },
      UpdateProfileRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'John Doe' },
          linkedinUrl: { type: 'string', example: 'https://linkedin.com/in/johndoe' },
          githubUrl: { type: 'string', example: 'https://github.com/johndoe' },
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
          notes: { type: 'string', nullable: true, example: 'Referred by senior engineer' },
          salaryMin: { type: 'integer', nullable: true, example: 120000 },
          salaryMax: { type: 'integer', nullable: true, example: 150000 },
          currency: { type: 'string', example: 'USD' },
          jobLocation: { type: 'string', nullable: true, example: 'Remote' },
          jobPostUrl: { type: 'string', nullable: true, example: 'https://careers.google.com/jobs/123' },
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
          notes: { type: 'string', example: 'Referral through team lead' },
          salaryMin: { type: 'integer', example: 120000 },
          salaryMax: { type: 'integer', example: 150000 },
          currency: { type: 'string', default: 'USD', example: 'USD' },
          jobLocation: { type: 'string', example: 'Remote' },
          jobPostUrl: { type: 'string', example: 'https://careers.google.com/jobs/123' },
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
          notes: { type: 'string', example: 'Completed technical screen' },
          salaryMin: { type: 'integer', example: 130000 },
          salaryMax: { type: 'integer', example: 160000 },
          currency: { type: 'string', example: 'USD' },
          jobLocation: { type: 'string', example: 'Hybrid' },
          jobPostUrl: { type: 'string', example: 'https://careers.google.com/jobs/123' },
        },
      },
      StatusHistory: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          applicationId: { type: 'integer', example: 1 },
          fromStatus: { type: 'string', example: 'Applied' },
          toStatus: { type: 'string', example: 'Interviewing' },
          notes: { type: 'string', nullable: true, example: 'Recruiter called for round 1' },
          changedAt: { type: 'string', format: 'date-time', example: '2026-09-05T14:00:00.000Z' },
        },
      },
      Interview: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          applicationId: { type: 'integer', example: 1 },
          roundName: { type: 'string', example: 'Technical Screen' },
          scheduledDate: { type: 'string', format: 'date-time', example: '2026-09-10T15:00:00.000Z' },
          meetingLink: { type: 'string', nullable: true, example: 'https://meet.google.com/abc-defg-hij' },
          interviewer: { type: 'string', nullable: true, example: 'Alex Smith (Eng Lead)' },
          feedbackNotes: { type: 'string', nullable: true, example: 'Focused on algorithms and system design' },
          status: {
            type: 'string',
            enum: ['Scheduled', 'Completed', 'Cancelled'],
            example: 'Scheduled',
          },
          createdAt: { type: 'string', format: 'date-time', example: '2026-09-05T14:00:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-09-05T14:00:00.000Z' },
        },
      },
      CreateInterviewRequest: {
        type: 'object',
        required: ['roundName', 'scheduledDate'],
        properties: {
          roundName: { type: 'string', example: 'Technical Screen' },
          scheduledDate: { type: 'string', format: 'date-time', example: '2026-09-10T15:00:00.000Z' },
          meetingLink: { type: 'string', example: 'https://meet.google.com/abc-defg-hij' },
          interviewer: { type: 'string', example: 'Alex Smith' },
          feedbackNotes: { type: 'string', example: 'Review graph algorithms' },
          status: {
            type: 'string',
            enum: ['Scheduled', 'Completed', 'Cancelled'],
            default: 'Scheduled',
            example: 'Scheduled',
          },
        },
      },
      UpdateInterviewRequest: {
        type: 'object',
        properties: {
          roundName: { type: 'string', example: 'Technical Round 2' },
          scheduledDate: { type: 'string', format: 'date-time', example: '2026-09-12T16:00:00.000Z' },
          meetingLink: { type: 'string', example: 'https://meet.google.com/xyz' },
          interviewer: { type: 'string', example: 'Sarah Connor' },
          feedbackNotes: { type: 'string', example: 'Strong performance on system design' },
          status: {
            type: 'string',
            enum: ['Scheduled', 'Completed', 'Cancelled'],
            example: 'Completed',
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
    '/auth/profile': {
      get: {
        summary: 'Get user profile',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Profile information',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } },
            },
          },
          401: { description: 'Unauthorized' },
          404: { description: 'User not found' },
        },
      },
      patch: {
        summary: 'Update user profile',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateProfileRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Profile updated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } },
            },
          },
          400: { description: 'Validation error' },
          401: { description: 'Unauthorized' },
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
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status' },
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
        description: 'Updates application fields. When status changes, a StatusHistory entry is automatically logged.',
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
    '/applications/{id}/history': {
      get: {
        summary: 'Get status change timeline',
        tags: ['Applications'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Timeline of status changes',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/StatusHistory' },
                },
              },
            },
          },
          403: { description: 'Forbidden' },
          404: { description: 'Application not found' },
        },
      },
    },
    '/applications/{id}/interviews': {
      get: {
        summary: 'List interviews for an application',
        tags: ['Interviews'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'List of scheduled interviews',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Interview' },
                },
              },
            },
          },
          403: { description: 'Forbidden' },
          404: { description: 'Application not found' },
        },
      },
      post: {
        summary: 'Schedule an interview for an application',
        tags: ['Interviews'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateInterviewRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Interview scheduled',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Interview' } },
            },
          },
          400: { description: 'Validation error' },
          403: { description: 'Forbidden' },
          404: { description: 'Application not found' },
        },
      },
    },
    '/interviews/{id}': {
      get: {
        summary: 'Get single interview by ID',
        tags: ['Interviews'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Interview details',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Interview' } } },
          },
          403: { description: 'Forbidden' },
          404: { description: 'Interview not found' },
        },
      },
      patch: {
        summary: 'Update interview',
        tags: ['Interviews'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateInterviewRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Interview updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Interview' } } },
          },
          400: { description: 'Validation error' },
          403: { description: 'Forbidden' },
          404: { description: 'Interview not found' },
        },
      },
      delete: {
        summary: 'Delete interview',
        tags: ['Interviews'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          204: { description: 'Interview deleted' },
          403: { description: 'Forbidden' },
          404: { description: 'Interview not found' },
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
