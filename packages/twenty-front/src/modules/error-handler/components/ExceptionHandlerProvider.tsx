import { PostHogIdentifyEffect } from '@/error-handler/components/PostHogIdentifyEffect';
import { SentryInitEffect } from '@/error-handler/components/SentryInitEffect';

export const ExceptionHandlerProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  return (
    <>
      <SentryInitEffect />
      <PostHogIdentifyEffect />
      {children}
    </>
  );
};
