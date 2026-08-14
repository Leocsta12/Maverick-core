import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Mission from '../../../app/(app)/mission';
import { useAuth } from '../../context/AuthContext';
import { addHabit, listHabits, listRecentCompletions, markDone, markUndone } from '../../lib/mission';
import { showAlert } from '../../lib/alert';

// Tela real (Hábitos) — só a fonte dos dados (lib/mission) é mockada, pra
// provar o fluxo de carregar/marcar/adicionar sem precisar de Supabase de
// verdade. Mesmo espírito de profile.test.tsx.
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/mission', () => ({
  ...jest.requireActual('../../lib/mission'),
  listHabits: jest.fn(),
  listRecentCompletions: jest.fn(),
  addHabit: jest.fn(),
  markDone: jest.fn(),
  markUndone: jest.fn(),
  archiveHabit: jest.fn(),
}));
jest.mock('../../lib/alert', () => ({ showAlert: jest.fn() }));

const mockedUseAuth = useAuth as jest.Mock;
const mockedListHabits = listHabits as jest.Mock;
const mockedListRecentCompletions = listRecentCompletions as jest.Mock;
const mockedAddHabit = addHabit as jest.Mock;
const mockedMarkDone = markDone as jest.Mock;
const mockedMarkUndone = markUndone as jest.Mock;

describe('Tela de Hábitos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ user: { id: 'u1', name: 'Ana' } });
    mockedListHabits.mockResolvedValue([
      { id: 'h1', title: 'Dormir 8h', sortOrder: 0 },
      { id: 'h2', title: 'Beber 2L de água', sortOrder: 1 },
    ]);
    mockedListRecentCompletions.mockResolvedValue([]);
  });

  it('mostra a lista de hábitos carregada', async () => {
    render(<Mission />);
    expect(await screen.findByText('Dormir 8h')).toBeTruthy();
    expect(screen.getByText('Beber 2L de água')).toBeTruthy();
  });

  it('mostra o progresso 0/2 quando nenhum hábito foi feito hoje', async () => {
    render(<Mission />);
    await screen.findByText('Dormir 8h');
    expect(screen.getByText('0/2')).toBeTruthy();
  });

  it('mostra o progresso 1/2 quando um hábito já foi concluído hoje', async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockedListRecentCompletions.mockResolvedValue([{ habitId: 'h1', completedDate: today }]);
    render(<Mission />);
    await screen.findByText('Dormir 8h');
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('marca um hábito como feito ao tocar nele', async () => {
    render(<Mission />);
    fireEvent.press(await screen.findByText('Dormir 8h'));
    await waitFor(() => expect(mockedMarkDone).toHaveBeenCalledWith('u1', 'h1', expect.any(String)));
  });

  it('desmarca um hábito já feito ao tocar nele de novo', async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockedListRecentCompletions.mockResolvedValue([{ habitId: 'h1', completedDate: today }]);
    render(<Mission />);
    fireEvent.press(await screen.findByText('Dormir 8h'));
    await waitFor(() => expect(mockedMarkUndone).toHaveBeenCalledWith('h1', today));
    expect(mockedMarkDone).not.toHaveBeenCalled();
  });

  it('adiciona um hábito novo com o título digitado', async () => {
    render(<Mission />);
    await screen.findByText('Dormir 8h');
    fireEvent.changeText(screen.getByPlaceholderText('Ex: Treinar 30 minutos'), 'Treinar 30 minutos');
    fireEvent.press(screen.getByText('Adicionar'));
    await waitFor(() => expect(mockedAddHabit).toHaveBeenCalledWith('u1', 'Treinar 30 minutos', 2));
  });

  it('não deixa adicionar hábito com título em branco', async () => {
    render(<Mission />);
    await screen.findByText('Dormir 8h');
    fireEvent.press(screen.getByText('Adicionar'));
    expect(mockedAddHabit).not.toHaveBeenCalled();
  });

  it('mostra mensagem de vazio quando não há hábitos ainda', async () => {
    mockedListHabits.mockResolvedValue([]);
    render(<Mission />);
    expect(await screen.findByText(/Nenhum hábito ainda/)).toBeTruthy();
  });

  it('avisa com showAlert quando falha ao carregar', async () => {
    mockedListHabits.mockRejectedValue(new Error('offline'));
    render(<Mission />);
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('Não foi possível carregar seus hábitos.'));
  });
});
