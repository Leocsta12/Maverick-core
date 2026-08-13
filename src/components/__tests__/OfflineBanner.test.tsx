import { render, screen } from '@testing-library/react-native';
import { OfflineBanner } from '../OfflineBanner';

describe('OfflineBanner', () => {
  it('não renderiza nada quando cachedAt é null (dado veio da rede, não do cache)', () => {
    render(<OfflineBanner cachedAt={null} />);
    expect(screen.queryByText(/Sem conexão/)).toBeNull();
  });

  it('mostra o aviso com o horário do cache quando offline', () => {
    render(<OfflineBanner cachedAt="2024-06-10T08:37:00.000Z" />);
    expect(screen.getByText(/Sem conexão agora — mostrando dados salvos às/)).toBeTruthy();
  });
});
