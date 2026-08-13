import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Profile from '../../../app/(app)/profile';
import { useAuth } from '../../context/AuthContext';

// Tela real, só a fonte dos dados é trocada — prova que dá pra testar uma
// tela inteira (render + interação) sem precisar de Supabase de verdade,
// só mockando o contexto de autenticação que ela consome.
jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.Mock;

describe('Tela de Perfil', () => {
  const updateProfile = jest.fn().mockResolvedValue(undefined);
  const signOut = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    updateProfile.mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Ana Atleta', email: 'ana@example.com' },
      updateProfile,
      signOut,
    });
  });

  it('mostra o nome e o e-mail atuais do usuário', () => {
    render(<Profile />);
    expect(screen.getByDisplayValue('Ana Atleta')).toBeTruthy();
    expect(screen.getByDisplayValue('ana@example.com')).toBeTruthy();
  });

  it('salva o novo nome ao tocar em "Salvar alterações"', async () => {
    render(<Profile />);
    fireEvent.changeText(screen.getByDisplayValue('Ana Atleta'), 'Ana Costa');
    fireEvent.press(screen.getByText('Salvar alterações'));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ name: 'Ana Costa' }));
  });

  it('chama signOut ao tocar em "Sair"', () => {
    render(<Profile />);
    fireEvent.press(screen.getByText('Sair'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('não deixa editar o e-mail', () => {
    render(<Profile />);
    expect(screen.getByDisplayValue('ana@example.com').props.editable).toBe(false);
  });
});
