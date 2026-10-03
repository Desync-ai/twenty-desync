import IconHubspotRaw from '@assets/icons/hubspot.svg?react';
import { type IconComponentProps } from '@ui/icon/types/IconComponent';
import { useTheme } from '@ui/theme-constants';

type IconHubspotProps = Pick<IconComponentProps, 'size'>;

export const IconHubspot = (props: IconHubspotProps) => {
  const theme = useTheme();
  const size = props.size ?? theme.icon.size.lg;

  return <IconHubspotRaw height={size} width={size} />;
};
