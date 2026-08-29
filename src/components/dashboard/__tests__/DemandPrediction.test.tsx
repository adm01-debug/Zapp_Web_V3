import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DemandPrediction } from '../DemandPrediction';

const dbFromMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/datasource/db', () => ({ dbFrom: dbFromMock }));

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({
      children,
      whileHover: _whileHover,
      ...props
    }: {
      children: ReactNode;
      whileHover?: unknown;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  // Não renderiza os filhos do gráfico: eles contêm definições SVG válidas na
  // árvore do Recharts, mas seriam montados dentro de uma <div> no teste.
  AreaChart: () => <div data-testid="demand-chart" />,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
}));

describe('DemandPrediction', () => {
  it('renderiza dados externos vazios como estáveis sem consultar a fonte', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <DemandPrediction data={[]} />
        </TooltipProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText('Previsão de Demanda')).toBeInTheDocument();
    expect(screen.getByText('Estável')).toBeInTheDocument();
    expect(screen.queryByText('Descendo')).not.toBeInTheDocument();
    expect(screen.queryByText(/^às$/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    expect(dbFromMock).not.toHaveBeenCalled();
  });
});
