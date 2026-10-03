import { Img } from 'react-email';

const logoStyle = {
  marginBottom: '40px',
};

export const Logo = () => {
  return (
    <Img
      src="https://twenty.desync.ai/desync-logo.png"
      alt="Desync logo"
      width="40"
      height="40"
      style={logoStyle}
    />
  );
};
