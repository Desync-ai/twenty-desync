import IconSalesforceRaw from '@assets/icons/salesforce.svg?react';
import { type IconComponentProps } from '@ui/icon/types/IconComponent';
import { useTheme } from '@ui/theme-constants';

type IconSalesforceProps = Pick<IconComponentProps, 'size'>;

export const IconSalesforce = (props: IconSalesforceProps) => {
  const theme = useTheme();
  const size = props.size ?? theme.icon.size.lg;

  return <IconSalesforceRaw height={size} width={size} />;
};
