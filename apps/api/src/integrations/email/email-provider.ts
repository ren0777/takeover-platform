export type VerificationEmail = {
  companyName: string;
  rawToken: string;
  toEmail: string;
};

export type ManagementLinkEmail = VerificationEmail;

export type AccessRequestEmail = {
  companyName: string;
  rawReviewToken: string;
  requesterEmail: string;
  toEmail: string;
};

export type AccessDecisionEmail = {
  companyName: string;
  decision: 'approved' | 'rejected';
  rawManagementToken?: string;
  toEmail: string;
};

export type EmailDeliveryResult = { messageId: string; acceptedAt: Date };

export interface EmailProvider {
  sendVerification(input: VerificationEmail): Promise<EmailDeliveryResult>;
  sendManagementLink(input: ManagementLinkEmail): Promise<EmailDeliveryResult>;
  sendAccessRequestNotification(input: AccessRequestEmail): Promise<EmailDeliveryResult>;
  sendAccessDecisionNotification(input: AccessDecisionEmail): Promise<EmailDeliveryResult>;
}
