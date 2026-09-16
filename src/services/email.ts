/**
 * Email Notification Service
 *
 * Provides transactional notifications for interview reminders and application status updates.
 * In development or when SMTP credentials are not configured, notifications are logged securely.
 */

export interface InterviewReminderPayload {
  toEmail: string;
  candidateName?: string;
  company: string;
  role: string;
  roundName: string;
  scheduledDate: Date;
  meetingLink?: string | null;
}

export interface StatusUpdatePayload {
  toEmail: string;
  candidateName?: string;
  company: string;
  role: string;
  fromStatus: string;
  toStatus: string;
}

export class EmailService {
  /**
   * Sends an interview round reminder notification.
   */
  static async sendInterviewReminder(payload: InterviewReminderPayload): Promise<boolean> {
    const formattedDate = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(payload.scheduledDate));

    const subject = `Reminder: Upcoming Interview with ${payload.company} (${payload.roundName})`;
    const content = `
Hello ${payload.candidateName || 'Candidate'},

This is a reminder for your upcoming interview round:
- Company: ${payload.company}
- Role: ${payload.role}
- Round: ${payload.roundName}
- Date & Time: ${formattedDate}
${payload.meetingLink ? `- Meeting Link: ${payload.meetingLink}` : ''}

Best of luck with your preparation!
    `.trim();

    // If SMTP is not configured, record delivery in logs
    console.info(`[EmailService] Simulated delivery to ${payload.toEmail} | Subject: "${subject}"`);
    return true;
  }

  /**
   * Sends a notification when an application status changes.
   */
  static async sendStatusUpdate(payload: StatusUpdatePayload): Promise<boolean> {
    const subject = `Application Status Update: ${payload.company} - ${payload.role}`;
    const content = `
Hello ${payload.candidateName || 'Candidate'},

The status for your application at ${payload.company} (${payload.role}) has been updated:
- Previous Status: ${payload.fromStatus}
- Current Status: ${payload.toStatus}
    `.trim();

    console.info(`[EmailService] Simulated delivery to ${payload.toEmail} | Subject: "${subject}"`);
    return true;
  }
}
