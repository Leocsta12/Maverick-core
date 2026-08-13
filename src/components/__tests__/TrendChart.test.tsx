import { render, screen } from '@testing-library/react-native';
import { TrendChart } from '../TrendChart';

describe('TrendChart', () => {
  it('mostra estado vazio sem nenhum dado', () => {
    render(<TrendChart title="PESO" unit="kg" data={[]} />);
    expect(screen.getByText('Sem registros ainda.')).toBeTruthy();
  });

  it('pede mais um dia de registro com só um ponto de dado', () => {
    render(<TrendChart title="PESO" unit="kg" data={[{ date: '2024-06-10', value: 80 }]} />);
    expect(screen.getByText('Registre mais um dia pra ver a tendência.')).toBeTruthy();
  });

  it('mostra o valor mais recente e a queda no período', () => {
    render(
      <TrendChart
        title="PESO"
        unit="kg"
        data={[
          { date: '2024-06-01', value: 80 },
          { date: '2024-06-10', value: 77 },
        ]}
      />
    );
    // O valor e a unidade ficam num <Text> aninhado dentro do outro — o RN
    // funde os dois como um único texto acessível ("77" + "kg" = "77kg").
    expect(screen.getByText('77kg')).toBeTruthy();
    expect(screen.getByText('-3.0kg no período')).toBeTruthy();
  });

  it('mostra o sinal de "+" quando o valor sobe no período', () => {
    render(
      <TrendChart
        title="SONO"
        unit="h"
        data={[
          { date: '2024-06-01', value: 6 },
          { date: '2024-06-10', value: 7.5 },
        ]}
      />
    );
    expect(screen.getByText('+1.5h no período')).toBeTruthy();
  });

  it('mostra "estável" quando o valor não muda no período', () => {
    render(
      <TrendChart
        title="HRV"
        unit="ms"
        data={[
          { date: '2024-06-01', value: 55 },
          { date: '2024-06-10', value: 55 },
        ]}
      />
    );
    expect(screen.getByText('estável')).toBeTruthy();
  });

  it('ignora pontos sem valor (null) ao decidir se tem dado suficiente', () => {
    render(
      <TrendChart
        title="PESO"
        unit="kg"
        data={[
          { date: '2024-06-01', value: 80 },
          // @ts-expect-error propositalmente simulando um dado incompleto vindo do banco
          { date: '2024-06-05', value: null },
          { date: '2024-06-10', value: 78 },
        ]}
      />
    );
    expect(screen.getByText('-2.0kg no período')).toBeTruthy();
  });
});
