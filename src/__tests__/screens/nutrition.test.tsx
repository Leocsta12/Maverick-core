import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Nutrition from '../../../app/(app)/nutrition';
import { useAuth } from '../../context/AuthContext';
import { addMeal, addWater, getGoals, listMeals, listWaterLogs } from '../../lib/nutrition';
import { showAlert } from '../../lib/alert';

// Tela real (Nutrition) — a fonte dos dados (lib/nutrition) é mockada; o
// cache (offlineCache) e a fila de escrita (offlineSync) rodam de verdade
// por cima dos mocks, então isso também cobre a integração da tela com o
// offline (Fase 1 leitura + Fase 2 escrita), não só o caminho feliz.
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/nutrition', () => ({
  ...jest.requireActual('../../lib/nutrition'),
  listMeals: jest.fn(),
  listWaterLogs: jest.fn(),
  getGoals: jest.fn(),
  addMeal: jest.fn(),
  addWater: jest.fn(),
  deleteMeal: jest.fn(),
  removeLastWaterLog: jest.fn(),
  upsertGoals: jest.fn(),
}));
jest.mock('../../lib/alert', () => ({ showAlert: jest.fn() }));

const mockedUseAuth = useAuth as jest.Mock;
const mockedListMeals = listMeals as jest.Mock;
const mockedListWaterLogs = listWaterLogs as jest.Mock;
const mockedGetGoals = getGoals as jest.Mock;
const mockedAddMeal = addMeal as jest.Mock;
const mockedAddWater = addWater as jest.Mock;

const DEFAULT_GOALS = { dailyCalories: null, dailyProteinG: null, dailyCarbsG: null, dailyFatG: null, dailyWaterMl: 2000 };

describe('Tela de Nutrition', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockedUseAuth.mockReturnValue({ user: { id: 'u1', name: 'Ana' } });
    mockedListMeals.mockResolvedValue([]);
    mockedListWaterLogs.mockResolvedValue([]);
    mockedGetGoals.mockResolvedValue(DEFAULT_GOALS);
  });

  it('mostra as refeições e a água carregadas', async () => {
    mockedListMeals.mockResolvedValue([
      { id: 'm1', entryDate: '2024-06-10', mealType: 'almoco', name: 'Frango com arroz', calories: 500, proteinG: null, carbsG: null, fatG: null, loggedAt: '2024-06-10T12:00:00Z' },
    ]);
    mockedListWaterLogs.mockResolvedValue([{ id: 'w1', entryDate: '2024-06-10', amountMl: 300, loggedAt: '2024-06-10T09:00:00Z' }]);

    render(<Nutrition />);

    expect(await screen.findByText('Frango com arroz')).toBeTruthy();
    expect(screen.getByText('300 / 2000 ml')).toBeTruthy();
  });

  it('mostra mensagem de vazio quando não há refeições hoje', async () => {
    render(<Nutrition />);
    expect(await screen.findByText('Nenhuma refeição registrada ainda hoje.')).toBeTruthy();
  });

  it('registra água ao tocar num botão de quick-add', async () => {
    mockedAddWater.mockResolvedValue(undefined);
    render(<Nutrition />);
    await screen.findByText('Nenhuma refeição registrada ainda hoje.');

    fireEvent.press(screen.getByText('+300ml'));

    await waitFor(() => expect(mockedAddWater).toHaveBeenCalledWith('u1', expect.any(String), 300));
  });

  it('registra uma refeição nova com os dados do formulário', async () => {
    mockedAddMeal.mockResolvedValue(undefined);
    render(<Nutrition />);
    await screen.findByText('Nenhuma refeição registrada ainda hoje.');

    fireEvent.changeText(screen.getByPlaceholderText('Ex: Arroz, feijão e frango grelhado'), 'Salada de frango');
    fireEvent.press(screen.getByText('Adicionar refeição'));

    await waitFor(() =>
      expect(mockedAddMeal).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ name: 'Salada de frango', mealType: 'cafe_da_manha' })
      )
    );
  });

  it('avisa com showAlert quando falha ao carregar e não existe cache anterior', async () => {
    mockedListMeals.mockRejectedValue(new Error('offline'));
    render(<Nutrition />);
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('Não foi possível carregar sua nutrição de hoje.'));
  });

  it('quando addMeal falha (sem conexão), enfileira, atualiza a tela na hora e avisa', async () => {
    mockedAddMeal.mockRejectedValue(new TypeError('Network request failed'));
    render(<Nutrition />);
    await screen.findByText('Nenhuma refeição registrada ainda hoje.');

    fireEvent.changeText(screen.getByPlaceholderText('Ex: Arroz, feijão e frango grelhado'), 'Barra de proteína');
    fireEvent.press(screen.getByText('Adicionar refeição'));

    expect(await screen.findByText('Barra de proteína')).toBeTruthy();
    expect(await screen.findByText('1 registro aguardando conexão pra sincronizar.')).toBeTruthy();
    expect(showAlert).toHaveBeenCalledWith(
      'Sem conexão agora — salvo no aparelho. Sincroniza sozinho assim que a internet voltar.'
    );
  });
});
