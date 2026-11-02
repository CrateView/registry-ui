// HTTP status is a stable fallback for upstream failures; own messages retain specific guidance.
export function requestErrorKey(status: number, message: string): string {
  const known: Record<string, string> = {
    'Invalid credentials': 'invalidCredentials',
    'Registry sign-in failed': 'invalidCredentials',
    'Sign-in required': 'signInRequired',
    'Username already exists': 'usernameExists',
    'User not found': 'userNotFound',
    'User administration not allowed': 'userAdministrationDenied',
    'User management disabled': 'userManagementDisabled',
    'Manifest deletion is disabled': 'deleteUnavailable',
    'Monitoring disabled': 'unavailable',
    'Monitoring storage unavailable': 'monitorDatabaseError',
    'Releases unavailable': 'changelogFailed',
    'Invalid username': 'loginUsernameInvalid',
    'Current password required': 'fieldRequired',
    'Password must have at least 12 characters and at most 72 UTF-8 bytes': 'passwordRequirements',
  };
  return (
    known[message] ||
    (
      {
        400: 'requestInvalid',
        401: 'invalidCredentials',
        403: 'accessDenied',
        404: 'notFound',
        409: 'requestInvalid',
        413: 'requestTooLarge',
        429: 'tooManyRequests',
      } as Record<number, string>
    )[status] ||
    (message.includes('Account') || message.includes('account') ? 'accountServiceUnavailable' : 'registryRequestFailed')
  );
}
