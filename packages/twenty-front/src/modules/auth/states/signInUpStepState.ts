import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';
export enum SignInUpStep {
  Init = 'init',
  Email = 'email',
  Password = 'password',
  EmailVerification = 'emailVerification',
  WorkspaceSelection = 'workspaceSelection',
  WorkspaceCreation = 'workspaceCreation',
  SsoIdentityProviderSelection = 'SSOIdentityProviderSelection',
  TwoFactorAuthenticationVerification = 'TwoFactorAuthenticationVerification',
  TwoFactorAuthenticationProvision = 'TwoFactorAuthenticationProvision',
  // Desync: the signup questionnaire, shown on the central domain after Clerk
  // sign-up and BEFORE the workspace choice/creation step.
  DesyncQuestionnaire = 'desyncQuestionnaire',
}

export const signInUpStepState = createAtomState<SignInUpStep>({
  key: 'signInUpStepState',
  defaultValue: SignInUpStep.Init,
});
