import {
  accessDecisionResultSchema,
  acceptedDeliverySchema,
  companyClaimResultSchema,
  emailTokenExchangeResultSchema,
  managementContextSchema,
  recoveryRequestResultSchema,
  takeoverIntentSchema,
  type AccessDecisionRequest,
  type AccessDecisionResult,
  type AcceptedDelivery,
  type CompanyClaimRequest,
  type CompanyClaimResult,
  type EmailTokenExchangeResult,
  type EmailVerificationRequest,
  type ManagementContext,
  type ManagementLinkRequest,
  type RecoveryRequest,
  type RecoveryRequestResult,
  type TakeoverIntent,
  type TakeoverPreparationRequest,
} from '@takeover/shared';
import { apiCommand, apiRequest } from '@/lib/api/client';

/**
 * One function per Phase 1 endpoint. Request and response shapes come from
 * `@takeover/shared`; nothing here restates a contract.
 */

export function beginCompanyClaim(input: CompanyClaimRequest): Promise<CompanyClaimResult> {
  return apiRequest({
    method: 'POST',
    path: '/api/company-claims',
    body: input,
    schema: companyClaimResultSchema,
  });
}

export function reissueEmailVerification(
  input: EmailVerificationRequest,
): Promise<AcceptedDelivery> {
  return apiRequest({
    method: 'POST',
    path: '/api/email-verifications',
    body: input,
    schema: acceptedDeliverySchema,
  });
}

/** Consumes a verification token read from the URL fragment. */
export function exchangeEmailVerification(token: string): Promise<EmailTokenExchangeResult> {
  return apiRequest({
    method: 'POST',
    path: '/api/email-verifications/exchange',
    body: { token },
    schema: emailTokenExchangeResultSchema,
  });
}

export function requestManagementLink(input: ManagementLinkRequest): Promise<AcceptedDelivery> {
  return apiRequest({
    method: 'POST',
    path: '/api/company-management-links',
    body: input,
    schema: acceptedDeliverySchema,
  });
}

/** Consumes a management token read from the URL fragment and establishes a session. */
export function exchangeManagementLink(token: string): Promise<ManagementContext> {
  return apiRequest({
    method: 'POST',
    path: '/api/company-management-links/exchange',
    body: { token },
    schema: managementContextSchema,
  });
}

export function getManagementContext(): Promise<ManagementContext> {
  return apiRequest({
    method: 'GET',
    path: '/api/company-management/context',
    schema: managementContextSchema,
  });
}

export function revokeManagementSession(): Promise<void> {
  return apiCommand({
    method: 'DELETE',
    path: '/api/company-management/session',
    withCsrf: true,
  });
}

export function approveAccessRequest(
  accessRequestId: string,
  input: AccessDecisionRequest,
): Promise<AccessDecisionResult> {
  return apiRequest({
    method: 'POST',
    path: `/api/company-access-requests/${encodeURIComponent(accessRequestId)}/approve`,
    body: input,
    schema: accessDecisionResultSchema,
    withCsrf: true,
  });
}

export function rejectAccessRequest(
  accessRequestId: string,
  input: AccessDecisionRequest,
): Promise<AccessDecisionResult> {
  return apiRequest({
    method: 'POST',
    path: `/api/company-access-requests/${encodeURIComponent(accessRequestId)}/reject`,
    body: input,
    schema: accessDecisionResultSchema,
    withCsrf: true,
  });
}

export function requestManualRecovery(input: RecoveryRequest): Promise<RecoveryRequestResult> {
  return apiRequest({
    method: 'POST',
    path: '/api/company-recovery-requests',
    body: input,
    schema: recoveryRequestResultSchema,
  });
}

export function updateTakeoverPreparation(
  intentId: string,
  input: TakeoverPreparationRequest,
): Promise<TakeoverIntent> {
  return apiRequest({
    method: 'PUT',
    path: `/api/takeover-intents/${encodeURIComponent(intentId)}/preparation`,
    body: input,
    schema: takeoverIntentSchema,
    withCsrf: true,
  });
}
