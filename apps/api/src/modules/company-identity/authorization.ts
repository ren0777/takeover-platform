export type ManagementAuthority = {
  companyId: string;
  grantId: string;
  sessionId: string;
  contactId?: string;
  expiresAt?: Date;
};

export class CompanyAuthorizationError extends Error {
  readonly statusCode = 403;

  constructor() {
    super('Management authority does not apply to this company');
    this.name = 'CompanyAuthorizationError';
  }
}

export function assertCompanyAuthority(authority: ManagementAuthority, companyId: string): void {
  if (authority.companyId !== companyId) throw new CompanyAuthorizationError();
}
