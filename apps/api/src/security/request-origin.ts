export class UntrustedMutationOriginError extends Error {
  readonly statusCode = 403;

  constructor() {
    super('Request origin is not trusted');
    this.name = 'UntrustedMutationOriginError';
  }
}

export function assertTrustedMutationOrigin(
  requestOrigin: string | undefined,
  trustedOrigin: string,
): void {
  if (requestOrigin === undefined || requestOrigin !== trustedOrigin) {
    throw new UntrustedMutationOriginError();
  }
}
