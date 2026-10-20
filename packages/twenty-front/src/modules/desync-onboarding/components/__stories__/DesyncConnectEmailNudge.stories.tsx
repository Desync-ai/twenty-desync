import {
  type Decorator,
  type Meta,
  type StoryObj,
} from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isGoogleMessagingEnabledState } from '@/client-config/states/isGoogleMessagingEnabledState';
import { DesyncConnectEmailNudge } from '@/desync-onboarding/components/DesyncConnectEmailNudge';
import { RecordIndexEmptyStateDisplay } from '@/object-record/record-index/components/RecordIndexEmptyStateDisplay';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { IconPlus } from 'twenty-ui/icon';
import { ComponentWithRouterDecorator } from '~/testing/decorators/ComponentWithRouterDecorator';
import { graphqlMocks } from '~/testing/graphqlMocks';
import { mockCurrentWorkspace } from '~/testing/mock-data/users';

const NoConnectedAccountDecorator: Decorator = (Story) => {
  window.localStorage.clear();
  jotaiStore.set(currentWorkspaceState.atom, mockCurrentWorkspace);
  jotaiStore.set(isGoogleMessagingEnabledState.atom, true);

  return <Story />;
};

const meta: Meta<typeof DesyncConnectEmailNudge> = {
  title: 'Modules/DesyncOnboarding/DesyncConnectEmailNudge',
  component: DesyncConnectEmailNudge,
  decorators: [NoConnectedAccountDecorator, ComponentWithRouterDecorator],
  args: { placement: 'get-started' },
  parameters: {
    msw: {
      handlers: [
        graphql.query('MyConnectedAccounts', () =>
          HttpResponse.json({ data: { myConnectedAccounts: [] } }),
        ),
        graphql.query('MyMessageChannels', () =>
          HttpResponse.json({ data: { myMessageChannels: [] } }),
        ),
        graphql.query('MyCalendarChannels', () =>
          HttpResponse.json({ data: { myCalendarChannels: [] } }),
        ),
        ...graphqlMocks.handlers,
      ],
    },
  },
};

export default meta;
type Story = StoryObj<typeof DesyncConnectEmailNudge>;

export const Default: Story = {};

export const InEmptyCompaniesView: Story = {
  args: { placement: 'empty-companies' },
  render: (args) => (
    <RecordIndexEmptyStateDisplay
      animatedPlaceholderType="noRecord"
      title="Add your first Company"
      subTitle="Use our API or add your first Company manually"
      ButtonIcon={IconPlus}
      buttonTitle="Add a Company"
      onButtonClick={() => {}}
      footer={<DesyncConnectEmailNudge {...args} />}
    />
  ),
};
