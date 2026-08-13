import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../Button';

describe('Button', () => {
  it('mostra o texto e chama onPress ao tocar', () => {
    const onPress = jest.fn();
    render(<Button label="Salvar" onPress={onPress} />);
    fireEvent.press(screen.getByText('Salvar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('troca o texto por um indicador de carregamento quando loading', () => {
    render(<Button label="Salvar" onPress={jest.fn()} loading testID="btn" />);
    expect(screen.queryByText('Salvar')).toBeNull();
  });

  // fireEvent.press simula um toque chamando a prop onPress direto — não
  // reproduz o gesto real do RN, que é quem de fato ignora toques num
  // Pressable disabled. O que é responsabilidade do nosso Button é repassar
  // disabled=true pro Pressable corretamente; é isso que testamos aqui.
  // getByTestId resolve pro elemento host (a View renderizada), que expõe
  // isso via accessibilityState.disabled, não uma prop "disabled" direta.
  it('marca o Pressable como desabilitado quando loading', () => {
    render(<Button label="Salvar" onPress={jest.fn()} loading testID="btn" />);
    expect(screen.getByTestId('btn').props.accessibilityState?.disabled).toBe(true);
  });

  it('marca o Pressable como desabilitado quando disabled', () => {
    render(<Button label="Salvar" onPress={jest.fn()} disabled testID="btn" />);
    expect(screen.getByTestId('btn').props.accessibilityState?.disabled).toBe(true);
  });

  it('não fica desabilitado no estado normal', () => {
    render(<Button label="Salvar" onPress={jest.fn()} testID="btn" />);
    expect(screen.getByTestId('btn').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('usa o estilo "ghost" sem quebrar a renderização', () => {
    render(<Button label="Cancelar" onPress={jest.fn()} variant="ghost" />);
    expect(screen.getByText('Cancelar')).toBeTruthy();
  });
});
