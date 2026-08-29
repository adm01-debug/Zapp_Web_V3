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
    div: ({ children, whileHover: _whileHover, ...props }: {
      children: ReactNode;
      whileHover?: unknown;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  // Do not render the chart children: they contain SVG defs that are valid
  // under Recharts' SVG tree but would be mounted under a test <div> here.
  AreaChart: () => <div data-testid="demand-chart" />,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
}));

describe('DemandPrediction', () => {
  it('renders an empty external dataset as stable without querying the datasource', () => {
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
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    expect(dbFromMock).not.toHaveBeenCalled();
  });
});
