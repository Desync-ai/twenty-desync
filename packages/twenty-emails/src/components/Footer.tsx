import { type I18n } from '@lingui/core';
import { Column, Container, Row } from 'react-email';
import { Link } from 'src/components/Link';
import { ShadowText } from 'src/components/ShadowText';

const footerContainerStyle = {
  marginTop: '12px',
};

type FooterProps = {
  i18n: I18n;
};

export const Footer = ({ i18n }: FooterProps) => {
  return (
    <Container style={footerContainerStyle}>
      <Row>
        <Column>
          <ShadowText>
            <Link
              href="https://desync.ai/"
              value={i18n._('Website')}
              aria-label={i18n._("Visit Desync's website")}
            />
          </ShadowText>
        </Column>
      </Row>
      <ShadowText>
        <>{i18n._('Desync')}</>
      </ShadowText>
    </Container>
  );
};
