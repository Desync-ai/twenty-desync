import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

import { OntologyLaunchController } from './ontology-launch.controller';

describe('OntologyLaunchController', () => {
  let controller: OntologyLaunchController;
  let configValues: Record<string, unknown>;

  const user = { id: 'user-1', email: 'A@Example.com' } as UserEntity;
  const workspace = { id: 'workspace-1' } as FlatWorkspace;

  beforeEach(async () => {
    configValues = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OntologyLaunchController],
      providers: [
        {
          provide: TwentyConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
      ],
    })
      // Real JwtAuthGuard/WorkspaceAuthGuard need their own DI graph
      // (AccessTokenService, WorkspaceCacheStorageService, ...) to
      // instantiate; that behaviour is exercised at the guards' own specs,
      // not here. This test only exercises the handler and checks (below)
      // that the guards are actually attached to the route.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OntologyLaunchController>(OntologyLaunchController);
  });

  it('rejects unauthenticated calls: the route is guarded by JwtAuthGuard and WorkspaceAuthGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OntologyLaunchController,
    );

    expect(guards).toEqual(
      expect.arrayContaining([
        JwtAuthGuard,
        WorkspaceAuthGuard,
        NoPermissionGuard,
      ]),
    );
  });

  it('404s when ONTOLOGY_CONSOLE_URL is unset', async () => {
    configValues.ONTOLOGY_CONSOLE_URL = undefined;

    await expect(controller.getLaunchUrl(user, workspace)).rejects.toThrow(
      'Not Found',
    );
  });

  it('returns the plain console URL when the SSO secret is unset', async () => {
    configValues.ONTOLOGY_CONSOLE_URL = 'https://console.example.com';
    configValues.ONTOLOGY_SSO_SECRET = undefined;

    const result = await controller.getLaunchUrl(user, workspace);

    expect(result).toEqual({ url: 'https://console.example.com' });
  });

  it('returns url + "#sso=" + token when both the console URL and secret are set', async () => {
    configValues.ONTOLOGY_CONSOLE_URL = 'https://console.example.com';
    configValues.ONTOLOGY_SSO_SECRET =
      'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

    const result = await controller.getLaunchUrl(user, workspace);

    expect(result.url.startsWith('https://console.example.com#sso=')).toBe(
      true,
    );

    const token = result.url.split('#sso=')[1];
    const [payloadSegment, signatureSegment] = token.split('.');

    expect(payloadSegment).toBeTruthy();
    expect(signatureSegment).toBeTruthy();

    const payload = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf-8'),
    );

    // Email comes from the authenticated user's context, lowercased.
    expect(payload.email).toBe('a@example.com');
    expect(payload.sub).toBe('user-1');
    expect(payload.ws).toBe('workspace-1');
    expect(payload.aud).toBe('ontology-console');
  });
});
