import { Test, type TestingModule } from '@nestjs/testing';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { LogicFunctionExecutorService } from 'src/engine/core-modules/logic-function/logic-function-executor/logic-function-executor.service';
import { LogicFunctionResourceService } from 'src/engine/core-modules/logic-function/logic-function-resource/logic-function-resource.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { LogicFunctionFromSourceHelperService } from 'src/engine/metadata-modules/logic-function/services/logic-function-from-source-helper.service';
import { LogicFunctionFromSourceService } from 'src/engine/metadata-modules/logic-function/services/logic-function-from-source.service';
import { getCreateCompanyWhenAddingNewPersonCodeStepLogicFunctionDefinitions } from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflow-code-step-logic-functions.util';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const CUSTOM_LOGIC_FUNCTION_ID = '20202020-0000-0000-0000-000000000002';
const APPLICATION_UNIVERSAL_IDENTIFIER = 'workspace-custom-app';

const buildFlatLogicFunction = (id: string) => ({
  id,
  sourceHandlerPath: `${id}/src/index.ts`,
  builtHandlerPath: `${id}/src/index.mjs`,
  isBuildUpToDate: false,
  checksum: null,
});

describe('LogicFunctionFromSourceService', () => {
  let service: LogicFunctionFromSourceService;

  const logicFunctionResourceService = {
    getSourceFile: jest.fn(),
    uploadSourceFile: jest.fn(),
    uploadBuiltFile: jest.fn(),
  };
  const logicFunctionExecutorService = {
    transpile: jest.fn(),
  };
  const helperService = {
    findLogicFunctionAndApplicationOrThrow: jest.fn(),
    updateOneFromMetadata: jest.fn(),
  };

  const mockLogicFunction = (id: string) => {
    helperService.findLogicFunctionAndApplicationOrThrow.mockResolvedValue({
      flatLogicFunction: buildFlatLogicFunction(id),
      ownerFlatApplication: {
        universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
      },
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    logicFunctionExecutorService.transpile.mockResolvedValue({
      builtCode: 'built code',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogicFunctionFromSourceService,
        {
          provide: LogicFunctionExecutorService,
          useValue: logicFunctionExecutorService,
        },
        {
          provide: LogicFunctionResourceService,
          useValue: logicFunctionResourceService,
        },
        { provide: ApplicationService, useValue: {} },
        {
          provide: LogicFunctionFromSourceHelperService,
          useValue: helperService,
        },
        { provide: WorkspaceManyOrAllFlatEntityMapsCacheService, useValue: {} },
        {
          provide: WorkspaceMigrationValidateBuildAndRunService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get(LogicFunctionFromSourceService);
  });

  describe('buildOneFromSource', () => {
    it('should build from the stored source file when it exists', async () => {
      mockLogicFunction(CUSTOM_LOGIC_FUNCTION_ID);
      logicFunctionResourceService.getSourceFile.mockResolvedValue(
        'stored source',
      );

      await service.buildOneFromSource({
        id: CUSTOM_LOGIC_FUNCTION_ID,
        workspaceId: WORKSPACE_ID,
      });

      expect(
        logicFunctionResourceService.uploadSourceFile,
      ).not.toHaveBeenCalled();
      expect(logicFunctionExecutorService.transpile).toHaveBeenCalledWith(
        expect.objectContaining({ sourceCode: 'stored source' }),
      );
      expect(helperService.updateOneFromMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          flatLogicFunctionToUpdate: expect.objectContaining({
            isBuildUpToDate: true,
          }),
        }),
      );
    });

    it('should restore a missing prefilled source file from its definition and build it', async () => {
      const [prefilledDefinition] =
        getCreateCompanyWhenAddingNewPersonCodeStepLogicFunctionDefinitions(
          WORKSPACE_ID,
        );

      mockLogicFunction(prefilledDefinition.id);
      logicFunctionResourceService.getSourceFile.mockResolvedValue(null);

      await service.buildOneFromSource({
        id: prefilledDefinition.id,
        workspaceId: WORKSPACE_ID,
      });

      expect(
        logicFunctionResourceService.uploadSourceFile,
      ).toHaveBeenCalledWith({
        sourceHandlerPath: `${prefilledDefinition.id}/src/index.ts`,
        sourceHandlerCode: prefilledDefinition.sourceHandlerCode,
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        workspaceId: WORKSPACE_ID,
      });
      expect(logicFunctionExecutorService.transpile).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceCode: prefilledDefinition.sourceHandlerCode,
        }),
      );
      expect(logicFunctionResourceService.uploadBuiltFile).toHaveBeenCalled();
    });

    it('should still throw when a non-prefilled source file is missing', async () => {
      mockLogicFunction(CUSTOM_LOGIC_FUNCTION_ID);
      logicFunctionResourceService.getSourceFile.mockResolvedValue(null);

      await expect(
        service.buildOneFromSource({
          id: CUSTOM_LOGIC_FUNCTION_ID,
          workspaceId: WORKSPACE_ID,
        }),
      ).rejects.toThrow('Source file not found');

      expect(
        logicFunctionResourceService.uploadSourceFile,
      ).not.toHaveBeenCalled();
      expect(logicFunctionExecutorService.transpile).not.toHaveBeenCalled();
    });
  });
});
