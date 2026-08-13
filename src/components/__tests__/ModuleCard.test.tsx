import { fireEvent, render, screen } from '@testing-library/react-native';
import { ModuleCard } from '../ModuleCard';

describe('ModuleCard', () => {
  it('mostra título e subtítulo', () => {
    render(<ModuleCard icon="heart" title="Health" subtitle="Sono, HRV, FC, passos" onPress={jest.fn()} />);
    expect(screen.getByText('Health')).toBeTruthy();
    expect(screen.getByText('Sono, HRV, FC, passos')).toBeTruthy();
  });

  it('chama onPress ao tocar quando não está bloqueado', () => {
    const onPress = jest.fn();
    render(<ModuleCard icon="heart" title="Health" subtitle="x" onPress={onPress} />);
    fireEvent.press(screen.getByText('Health'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('mostra "EM BREVE" e não repassa onPress pro Pressable quando locked', () => {
    // fireEvent.press sobe a árvore até achar QUALQUER ancestral com uma
    // prop onPress — inclusive o próprio ModuleCard, que ainda carrega o
    // onPress recebido de fora mesmo quando decide não usá-lo. Por isso a
    // asserção certa aqui é direto na prop que o Pressable de fato recebe,
    // não simular um toque.
    const onPress = jest.fn();
    render(<ModuleCard icon="heart" title="Health" subtitle="x" onPress={onPress} locked testID="card" />);
    expect(screen.getByText('EM BREVE')).toBeTruthy();
    expect(screen.getByTestId('card').props.onPress).toBeUndefined();
  });

  it('não mostra "EM BREVE" quando não está bloqueado', () => {
    render(<ModuleCard icon="heart" title="Health" subtitle="x" onPress={jest.fn()} />);
    expect(screen.queryByText('EM BREVE')).toBeNull();
  });
});
