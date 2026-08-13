import { fireEvent, render, screen } from '@testing-library/react-native';
import { TextField } from '../TextField';

describe('TextField', () => {
  it('mostra o label e o valor atual', () => {
    render(<TextField label="E-mail" value="leo@example.com" onChangeText={jest.fn()} />);
    expect(screen.getByText('E-mail')).toBeTruthy();
    expect(screen.getByDisplayValue('leo@example.com')).toBeTruthy();
  });

  it('chama onChangeText ao digitar', () => {
    const onChangeText = jest.fn();
    render(<TextField label="E-mail" value="" onChangeText={onChangeText} placeholder="voce@email.com" />);
    fireEvent.changeText(screen.getByPlaceholderText('voce@email.com'), 'novo@email.com');
    expect(onChangeText).toHaveBeenCalledWith('novo@email.com');
  });

  it('mostra a mensagem de erro quando fornecida', () => {
    render(<TextField label="Senha" value="" onChangeText={jest.fn()} error="Senha muito curta" />);
    expect(screen.getByText('Senha muito curta')).toBeTruthy();
  });

  it('não mostra nenhuma mensagem de erro por padrão', () => {
    render(<TextField label="Senha" value="" onChangeText={jest.fn()} />);
    expect(screen.queryByText(/curta|inválid/)).toBeNull();
  });
});
