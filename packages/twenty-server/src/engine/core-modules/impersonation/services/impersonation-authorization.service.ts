import { Injectable } from '@nestjs/common';

import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { userHasAdminPrivileges } from 'src/engine/core-modules/impersonation/utils/user-has-admin-privileges.util';
import { NodeEnvironment } from 'src/engine/core-modules/twenty-config/interfaces/node-environment.interface';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { twoFactorAuthenticationMethodsValidator } from 'src/engine/core-modules/two-factor-authentication/two-factor-authentication.validation';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

export type ImpersonationLevel = 'server' | 'workspace';

export type ImpersonationDenialReason =
  | 'SERVER_LEVEL_NOT_ALLOWED'
  | 'SERVER_LEVEL_2FA_PROVISION_REQUIRED'
  | 'SERVER_LEVEL_2FA_VERIFICATION_REQUIRED'
  | 'WORKSPACE_LEVEL_NOT_ALLOWED'
  | 'TARGET_HAS_ADMIN_PRIVILEGES';

export type ImpersonationAuthorizationResult =
  | { allowed: true; level: ImpersonationLevel }
  | {
      allowed: false;
      level: ImpersonationLevel;
      reason: ImpersonationDenialReason;
    };

@Injectable()
export class ImpersonationAuthorizationService {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  // Desync: impersonation is restricted to an explicit allowlist of support
  // operators (env IMPERSONATION_ALLOWED_EMAILS, comma-separated; default = the
  // three founders). A stray canImpersonate / IMPERSONATE grant is useless to
  // anyone not on this list — the hard gate against operator-surface abuse.
  private static readonly DEFAULT_IMPERSONATION_ALLOWED_EMAILS = [
    'jackson@desync.ai',
    'maks@desync.ai',
    'mark@desync.ai',
  ];

  private isEmailAllowedToImpersonate(email?: string | null): boolean {
    if (!isDefined(email)) {
      return false;
    }
    const configured = (process.env.IMPERSONATION_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
    const allowlist =
      configured.length > 0
        ? configured
        : ImpersonationAuthorizationService.DEFAULT_IMPERSONATION_ALLOWED_EMAILS;

    return allowlist.includes(email.trim().toLowerCase());
  }

  getImpersonationLevel(
    impersonatorUserWorkspace: UserWorkspaceEntity,
    targetUserWorkspace: UserWorkspaceEntity,
  ): ImpersonationLevel {
    return targetUserWorkspace.workspace.id !==
      impersonatorUserWorkspace.workspace.id
      ? 'server'
      : 'workspace';
  }

  async checkImpersonationAuthorization(
    impersonatorUserWorkspace: UserWorkspaceEntity,
    targetUserWorkspace: UserWorkspaceEntity,
  ): Promise<ImpersonationAuthorizationResult> {
    const level = this.getImpersonationLevel(
      impersonatorUserWorkspace,
      targetUserWorkspace,
    );

    // Desync hard gate: only allowlisted support operators may impersonate, at
    // any level — independent of the canImpersonate / IMPERSONATE flags.
    if (
      !this.isEmailAllowedToImpersonate(impersonatorUserWorkspace.user.email)
    ) {
      return {
        allowed: false,
        level,
        reason:
          level === 'server'
            ? 'SERVER_LEVEL_NOT_ALLOWED'
            : 'WORKSPACE_LEVEL_NOT_ALLOWED',
      };
    }

    if (level === 'server') {
      const hasServerLevelImpersonatePermission =
        impersonatorUserWorkspace.user.canImpersonate === true &&
        targetUserWorkspace.workspace.allowImpersonation === true;

      if (!hasServerLevelImpersonatePermission) {
        return { allowed: false, level, reason: 'SERVER_LEVEL_NOT_ALLOWED' };
      }

      if (this.isTwoFactorRequiredForServerLevelImpersonation()) {
        const twoFactorDenialReason = this.getServerLevelTwoFactorDenialReason(
          impersonatorUserWorkspace,
        );

        if (isDefined(twoFactorDenialReason)) {
          return { allowed: false, level, reason: twoFactorDenialReason };
        }
      }

      // Desync: block impersonating a higher-privileged (admin) user at server
      // level too — the workspace-level branch already enforces this below.
      if (
        userHasAdminPrivileges(targetUserWorkspace.user) &&
        !userHasAdminPrivileges(impersonatorUserWorkspace.user)
      ) {
        return { allowed: false, level, reason: 'TARGET_HAS_ADMIN_PRIVILEGES' };
      }

      return { allowed: true, level };
    }

    const hasWorkspaceLevelImpersonatePermission =
      await this.permissionsService.userHasWorkspaceSettingPermission({
        userWorkspaceId: impersonatorUserWorkspace.id,
        setting: PermissionFlagType.IMPERSONATE,
        workspaceId: targetUserWorkspace.workspace.id,
      });

    if (!hasWorkspaceLevelImpersonatePermission) {
      return { allowed: false, level, reason: 'WORKSPACE_LEVEL_NOT_ALLOWED' };
    }

    if (
      userHasAdminPrivileges(targetUserWorkspace.user) &&
      !userHasAdminPrivileges(impersonatorUserWorkspace.user)
    ) {
      return { allowed: false, level, reason: 'TARGET_HAS_ADMIN_PRIVILEGES' };
    }

    return { allowed: true, level };
  }

  private isTwoFactorRequiredForServerLevelImpersonation(): boolean {
    return (
      this.twentyConfigService.get('NODE_ENV') !== NodeEnvironment.DEVELOPMENT
    );
  }

  private getServerLevelTwoFactorDenialReason(
    impersonatorUserWorkspace: UserWorkspaceEntity,
  ): ImpersonationDenialReason | undefined {
    const twoFactorAuthenticationMethods =
      impersonatorUserWorkspace.twoFactorAuthenticationMethods;

    if (
      !twoFactorAuthenticationMethodsValidator.areDefined(
        twoFactorAuthenticationMethods,
      )
    ) {
      return 'SERVER_LEVEL_2FA_PROVISION_REQUIRED';
    }

    if (
      !twoFactorAuthenticationMethodsValidator.areVerified(
        twoFactorAuthenticationMethods,
      )
    ) {
      return 'SERVER_LEVEL_2FA_VERIFICATION_REQUIRED';
    }

    return undefined;
  }
}
