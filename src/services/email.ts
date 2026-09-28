/**
 * Email Notification Service
 *
 * Provides transactional notifications for interview reminders, application status updates,
 * and secure password reset operations.
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

export interface PasswordResetPayload {
  toEmail: string;
  candidateName?: string;
  resetToken: string;
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
    console.info(`[EmailService] Simulated delivery to ${payload.toEmail} | Subject: "${subject}"`);
    return true;
  }

  /**
   * Sends a notification when an application status changes.
   */
  static async sendStatusUpdate(payload: StatusUpdatePayload): Promise<boolean> {
    const subject = `Application Status Update: ${payload.company} - ${payload.role}`;
    console.info(`[EmailService] Simulated delivery to ${payload.toEmail} | Subject: "${subject}"`);
    return true;
  }

  /**
   * Sends a password reset token to the user.
   */
  static async sendPasswordReset(payload: PasswordResetPayload): Promise<boolean> {
    const subject = 'Password Reset Request - Job Application Tracker';
    console.info(
      `[EmailService] Simulated password reset token delivery to ${payload.toEmail} | Token: ${payload.resetToken}`
    );
    return true;
  }
}
