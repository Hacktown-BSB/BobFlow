/**
 * MockCodeGraphProvider
 *
 * Returns a deterministic CodeContext for testing and emergency fallback.
 * Activated when CODE_INTELLIGENCE_PROVIDER=mock (or as automatic fallback
 * when the Graphify provider fails).
 *
 * The fixture intentionally represents a realistic scenario
 * (authentication/login flow breaking after a service change) so it can
 * serve as a credible demo fallback without leaking implementation details
 * of any real repository.
 */

import type { CodeContext, CodeGraphProvider, CodeIntelligenceInput } from '../types.js';

const MOCK_FIXTURE: Omit<CodeContext, 'requestId'> = {
  status:    'accessible',
  repository: 'demo-repo',
  ref:        'main',
  relevantSymbols: [
    'AuthController',
    'UserService',
    'UserRepository',
  ],
  relevantFiles: [
    'src/auth/AuthController.ts',
    'src/users/UserService.ts',
    'src/users/UserRepository.ts',
  ],
  relations: [
    { from: 'AuthController',  to: 'UserService',    kind: 'calls' },
    { from: 'UserService',     to: 'UserRepository',  kind: 'calls' },
    { from: 'UserRepository',  to: 'Database',        kind: 'queries' },
  ],
  callPaths: [
    'AuthController -> UserService -> UserRepository -> Database',
  ],
  potentiallyImpacted: [
    'AuthController',
    'LoginController',
    'SessionService',
  ],
  summary:  'Mock context: authentication/user-lookup flow. AuthController delegates to UserService which uses UserRepository.',
  evidence: ['mock-provider — fixture data'],
  provider: 'mock',
};

export class MockCodeGraphProvider implements CodeGraphProvider {
  readonly name = 'mock';

  async getContext(input: CodeIntelligenceInput): Promise<CodeContext> {
    return {
      requestId: input.input.request_id,
      ...MOCK_FIXTURE,
    };
  }
}
