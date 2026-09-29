import { Test, type TestingModule } from '@nestjs/testing';

import { MaintenanceModeService } from 'src/engine/core-modules/admin-panel/maintenance-mode.service';
import { DomainServerConfigService } from 'src/engine/core-modules/domain/domain-server-config/services/domain-server-config.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';

import { ClientConfigService } from './client-config.service';

describe('ClientConfigService', () => {
  let service: ClientConfigService;
  let configValues: Record<string, unknown>;

  beforeEach(async () => {
    configValues = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientConfigService,
        {
          provide: TwentyConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
        {
          provide: DomainServerConfigService,
          useValue: {
            getFrontUrl: jest.fn(() => new URL('https://app.example.com')),
            getPublicBaseHostnameOrUndefined: jest.fn(() => undefined),
          },
        },
        {
          provide: AiModelRegistryService,
          useValue: {
            getAdminFilteredModels: jest.fn(() => []),
            getResolvedProvidersForAdmin: jest.fn(() => ({})),
            findDefaultModelForTier: jest.fn(() => undefined),
            getModelConfig: jest.fn(() => undefined),
          },
        },
        {
          provide: MaintenanceModeService,
          useValue: {
            getMaintenanceMode: jest.fn(async () => undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ClientConfigService>(ClientConfigService);
  });

  describe('ontology', () => {
    it('is enabled with the configured URL when ONTOLOGY_CONSOLE_URL is set', async () => {
      configValues.ONTOLOGY_CONSOLE_URL = 'https://console.example.com';

      const clientConfig = await service.getClientConfig();

      expect(clientConfig.ontology).toEqual({
        isEnabled: true,
        consoleUrl: 'https://console.example.com',
      });
    });

    it('is disabled with a null URL when ONTOLOGY_CONSOLE_URL is unset', async () => {
      configValues.ONTOLOGY_CONSOLE_URL = undefined;

      const clientConfig = await service.getClientConfig();

      expect(clientConfig.ontology).toEqual({
        isEnabled: false,
        consoleUrl: null,
      });
    });

    it('never exposes ONTOLOGY_SSO_SECRET through the client config payload', async () => {
      configValues.ONTOLOGY_CONSOLE_URL = 'https://console.example.com';
      configValues.ONTOLOGY_SSO_SECRET = 'do-not-leak-this-secret';

      const clientConfig = await service.getClientConfig();

      expect(JSON.stringify(clientConfig)).not.toContain(
        'do-not-leak-this-secret',
      );
    });
  });
});
