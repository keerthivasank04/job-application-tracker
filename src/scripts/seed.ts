import bcrypt from 'bcrypt';
import { db } from '../prisma/db';

async function seed(): Promise<void> {
  console.log('Seeding development database with sample records...');

  try {
    let user = await db.orm.public.User.where({ email: 'demo@jobtracker.dev' }).first();

    if (!user) {
      const passwordHash = await bcrypt.hash('DemoPassword123', 10);
      user = await db.orm.public.User.create({
        email: 'demo@jobtracker.dev',
        passwordHash,
        name: 'Demo Candidate',
        linkedinUrl: 'https://linkedin.com/in/democandidate',
        githubUrl: 'https://github.com/democandidate',
      });
      console.log('Created sample user: demo@jobtracker.dev (Password: DemoPassword123)');
    }

    const sampleApplications = [
      {
        company: 'Google',
        role: 'Staff Backend Engineer',
        status: 'Interviewing',
        salaryMin: 180000,
        salaryMax: 220000,
        jobLocation: 'Remote',
        currency: 'USD',
        notes: 'Referred by team lead.',
        daysAgo: 12,
      },
      {
        company: 'Stripe',
        role: 'Senior Platform Engineer',
        status: 'Offered',
        salaryMin: 175000,
        salaryMax: 210000,
        jobLocation: 'San Francisco, CA',
        currency: 'USD',
        notes: 'Received offer letter after round 4.',
        daysAgo: 21,
      },
      {
        company: 'Shopify',
        role: 'Senior Software Developer',
        status: 'Applied',
        salaryMin: 150000,
        salaryMax: 180000,
        jobLocation: 'Remote',
        currency: 'USD',
        notes: 'Applied through careers portal.',
        daysAgo: 3,
      },
    ];

    for (const { daysAgo, ...appData } of sampleApplications) {
      const existing = await db.orm.public.Application.where({
        userId: user.id,
        company: appData.company,
      }).first();

      if (!existing) {
        const created = await db.orm.public.Application.create({
          ...appData,
          appliedDate: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
          userId: user.id,
        });

        if (appData.status !== 'Applied') {
          await db.orm.public.StatusHistory.create({
            applicationId: created.id,
            fromStatus: 'Applied',
            toStatus: appData.status,
            notes: 'Seeded sample status change',
          });
        }

        if (appData.status === 'Interviewing') {
          await db.orm.public.Interview.create({
            applicationId: created.id,
            roundName: 'System Architecture Screen',
            scheduledDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            meetingLink: 'https://meet.google.com/abc-defg-hij',
            interviewer: 'Jane Doe (Director of Engineering)',
            feedbackNotes: 'Prepare distributed systems and messaging patterns',
            status: 'Scheduled',
          });
        }
      }
    }

    console.log('Database seeding completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();
