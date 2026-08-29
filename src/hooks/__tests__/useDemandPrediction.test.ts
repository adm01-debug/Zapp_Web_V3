/**
 * Tests for useDemandPrediction().
 *
 * When externalData is provided the hook skips the Supabase query entirely
 * and computes insights purely from the supplied data. That makes the hook
 * testable without any DB or QueryClient mocking.
 *
 * The hook must still be rendered inside a QueryClientProvider because it
 * calls useQuery() even when externalData is present.
 *
 * Covered:
 *   - data returned equals externalData when provided
 *   - empty externalData is handled without querying or invalid insights
 *   - the datasource query remains enabled when externalData is omitted
 *   - the React Query cancellation signal reaches the datasource builder
 *   - insights.maxPredicted is the maximum predicted value among isPrediction=true points
 *   - insights.avgPredicted is the average of predicted values among isPrediction=true points
 *   - insights.currentActual is the actual value of the first non-prediction point
 *   - insights.trend is 'up' when last prediction > currentActual
 *   - insights.trend is 'down' when last prediction < currentActual
 *   - insights.peakTime is the time string of the point with the highest predicted value
 *   - insights.capacityRisk is true when maxPredicted > currentCapacity
 *   - insights.capacityRisk is false when maxPredicted <= currentCapacity
 *   - default currentCapacity is 35
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useDemandPrediction, type PredictionPoint } from '../useDemandPrediction';

const { dbFromMock, selectMock, gteMock, abortSignalMock } = vi.hoisted(() => {
  const abortSignal = vi.fn(async (_signal: AbortSignal) => ({ data: [], error: null }));
  const gte = vi.fn(() => ({ abortSignal }));
  const select = vi.fn(() => ({ gte }));
  const dbFrom = vi.fn(() => ({ select }));

  return { dbFromMock: dbFrom, selectMock: select, gteMock: gte, abortSignalMock: abortSignal };
});

vi.mock('@/integrations/datasource/db', () => ({ dbFrom: dbFromMock }));

beforeEach(() => {
  dbFromMock.mockClear();
  selectMock.mockClear();
  gteMock.mockClear();
  abortSignalMock.mockClear();
});

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function mockPendingAbortableQuery() {
  abortSignalMock.mockImplementationOnce((signal: AbortSignal) => new Promise((_, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('Query cancelled', 'AbortError')),
      { once: true }
    );
  }));
}

function makeData(points: Partial<PredictionPoint>[]): PredictionPoint[] {
  return points.map((p, i) => ({
    time: `${String(i).padStart(2, '0')}:00`,
    predicted: 0,
    lower: 0,
    upper: 0,
    ...p,
  }));
}

// 5 history + 4 prediction points similar to the real hook's shape
const HISTORY = makeData([
  { actual: 10, predicted: 10, lower: 10, upper: 10, isPrediction: false },
  { actual: 20, predicted: 20, lower: 20, upper: 20, isPrediction: false },
  { actual: 30, predicted: 30, lower: 30, upper: 30, isPrediction: false },
  { actual: 15, predicted: 15, lower: 15, upper: 15, isPrediction: false },
  { actual: 5,  predicted: 5,  lower: 5,  upper: 5,  isPrediction: false },
]);

const PREDICTIONS = makeData([
  { predicted: 20, lower: 15, upper: 25, isPrediction: true, time: '06:00' },
  { predicted: 50, lower: 45, upper: 55, isPrediction: true, time: '07:00' },
  { predicted: 40, lower: 35, upper: 45, isPrediction: true, time: '08:00' },
  { predicted: 30, lower: 25, upper: 35, isPrediction: true, time: '09:00' },
]);

const EXTERNAL_DATA: PredictionPoint[] = [...HISTORY, ...PREDICTIONS];

// ── data passthrough ───────────────────────────────────────────────────────────
describe('useDemandPrediction — data passthrough', () => {
  it('returns externalData unchanged as data', () => {
    const { result } = renderHook(
      () => useDemandPrediction(EXTERNAL_DATA),
      { wrapper: makeWrapper() }
    );
    expect(result.current.data).toBe(EXTERNAL_DATA);
  });

  it('does not query the datasource when externalData is provided', () => {
    renderHook(() => useDemandPrediction(EXTERNAL_DATA), { wrapper: makeWrapper() });

    expect(dbFromMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
    expect(gteMock).not.toHaveBeenCalled();
  });

  it('queries the datasource when externalData is omitted', async () => {
    renderHook(() => useDemandPrediction(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(dbFromMock).toHaveBeenCalledWith('evolution_messages');
    });
    expect(selectMock).toHaveBeenCalledWith('created_at');
    expect(gteMock).toHaveBeenCalledOnce();
    expect(abortSignalMock).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('aborts an in-flight datasource query when the consumer unmounts', async () => {
    mockPendingAbortableQuery();

    const { unmount } = renderHook(() => useDemandPrediction(), { wrapper: makeWrapper() });

    await waitFor(() => expect(abortSignalMock).toHaveBeenCalledOnce());
    const forwardedSignal = abortSignalMock.mock.calls[0][0];
    expect(forwardedSignal.aborted).toBe(false);

    unmount();

    await waitFor(() => expect(forwardedSignal.aborted).toBe(true));
  });

  it('aborts an in-flight query when externalData becomes the active source', async () => {
    mockPendingAbortableQuery();

    const initialProps: { externalData: PredictionPoint[] | undefined } = {
      externalData: undefined,
    };
    const { result, rerender } = renderHook(
      ({ externalData }: { externalData: PredictionPoint[] | undefined }) => (
        useDemandPrediction(externalData)
      ),
      {
        initialProps,
        wrapper: makeWrapper(),
      }
    );

    await waitFor(() => expect(abortSignalMock).toHaveBeenCalledOnce());
    const forwardedSignal = abortSignalMock.mock.calls[0][0];
    expect(forwardedSignal.aborted).toBe(false);

    rerender({ externalData: EXTERNAL_DATA });

    expect(result.current.data).toBe(EXTERNAL_DATA);
    expect(dbFromMock).toHaveBeenCalledOnce();
    await waitFor(() => expect(forwardedSignal.aborted).toBe(true));
  });

  it('keeps a shared in-flight query alive while another DB observer is active', async () => {
    mockPendingAbortableQuery();

    const wrapper = makeWrapper();
    const dbConsumer = renderHook(() => useDemandPrediction(), { wrapper });
    const initialProps: { externalData: PredictionPoint[] | undefined } = {
      externalData: undefined,
    };
    const switchingConsumer = renderHook(
      ({ externalData }: { externalData: PredictionPoint[] | undefined }) => (
        useDemandPrediction(externalData)
      ),
      { initialProps, wrapper }
    );

    await waitFor(() => expect(abortSignalMock).toHaveBeenCalledOnce());
    const sharedSignal = abortSignalMock.mock.calls[0][0];

    switchingConsumer.rerender({ externalData: EXTERNAL_DATA });

    expect(switchingConsumer.result.current.data).toBe(EXTERNAL_DATA);
    expect(sharedSignal.aborted).toBe(false);

    dbConsumer.unmount();
    switchingConsumer.unmount();
    await waitFor(() => expect(sharedSignal.aborted).toBe(true));
  });

  it('does not cancel a shared DB query when another consumer mounts with externalData', async () => {
    mockPendingAbortableQuery();

    const wrapper = makeWrapper();
    const dbConsumer = renderHook(() => useDemandPrediction(), { wrapper });
    await waitFor(() => expect(abortSignalMock).toHaveBeenCalledOnce());
    const sharedSignal = abortSignalMock.mock.calls[0][0];

    const externalConsumer = renderHook(
      () => useDemandPrediction(EXTERNAL_DATA),
      { wrapper }
    );

    expect(externalConsumer.result.current.data).toBe(EXTERNAL_DATA);
    expect(sharedSignal.aborted).toBe(false);

    externalConsumer.unmount();
    expect(sharedSignal.aborted).toBe(false);
    dbConsumer.unmount();
    await waitFor(() => expect(sharedSignal.aborted).toBe(true));
  });

  it('handles empty externalData without querying or invalid insights', () => {
    const emptyData: PredictionPoint[] = [];
    const { result } = renderHook(
      () => useDemandPrediction(emptyData),
      { wrapper: makeWrapper() }
    );

    expect(result.current.data).toBe(emptyData);
    expect(result.current.insights).toEqual({
      maxPredicted: 0,
      avgPredicted: 0,
      currentActual: 0,
      trend: 'stable',
      peakTime: '',
      capacityRisk: false,
    });
    expect(dbFromMock).not.toHaveBeenCalled();
  });

  it('preserves the current actual value when externalData has no predictions yet', () => {
    const historyOnly = makeData([
      { actual: 17, predicted: 17, lower: 17, upper: 17, isPrediction: false },
    ]);
    const { result } = renderHook(
      () => useDemandPrediction(historyOnly),
      { wrapper: makeWrapper() }
    );

    expect(result.current.insights.currentActual).toBe(17);
    expect(result.current.insights.maxPredicted).toBe(0);
    expect(result.current.insights.avgPredicted).toBe(0);
    expect(result.current.insights.trend).toBe('stable');
    expect(result.current.insights.capacityRisk).toBe(false);
    expect(dbFromMock).not.toHaveBeenCalled();
  });
});

// ── insights ───────────────────────────────────────────────────────────────────
describe('useDemandPrediction — insights', () => {
  it('maxPredicted is the highest predicted value among isPrediction=true points', () => {
    const { result } = renderHook(
      () => useDemandPrediction(EXTERNAL_DATA),
      { wrapper: makeWrapper() }
    );
    expect(result.current.insights.maxPredicted).toBe(50);
  });

  it('avgPredicted is the mean of predicted values among isPrediction=true points', () => {
    const { result } = renderHook(
      () => useDemandPrediction(EXTERNAL_DATA),
      { wrapper: makeWrapper() }
    );
    // (20 + 50 + 40 + 30) / 4 = 35
    expect(result.current.insights.avgPredicted).toBe(35);
  });

  it('currentActual is the actual value of the first non-prediction data point', () => {
    const { result } = renderHook(
      () => useDemandPrediction(EXTERNAL_DATA),
      { wrapper: makeWrapper() }
    );
    expect(result.current.insights.currentActual).toBe(10);
  });

  it('trend is "up" when last prediction exceeds currentActual', () => {
    // last prediction = 30, currentActual = 10 → up
    const { result } = renderHook(
      () => useDemandPrediction(EXTERNAL_DATA),
      { wrapper: makeWrapper() }
    );
    expect(result.current.insights.trend).toBe('up');
  });

  it('trend is "down" when last prediction is below currentActual', () => {
    // Build data where last prediction < currentActual
    const highActual = makeData([
      { actual: 100, predicted: 100, lower: 100, upper: 100, isPrediction: false },
    ]);
    const lowPredictions = makeData([
      { predicted: 5, lower: 3, upper: 7, isPrediction: true, time: '10:00' },
      { predicted: 3, lower: 1, upper: 5, isPrediction: true, time: '11:00' }, // last < 100
    ]);
    const { result } = renderHook(
      () => useDemandPrediction([...highActual, ...lowPredictions]),
      { wrapper: makeWrapper() }
    );
    expect(result.current.insights.trend).toBe('down');
  });

  it('peakTime is the time string of the point with the highest predicted value', () => {
    const { result } = renderHook(
      () => useDemandPrediction(EXTERNAL_DATA),
      { wrapper: makeWrapper() }
    );
    expect(result.current.insights.peakTime).toBe('07:00');
  });

  it('capacityRisk is true when maxPredicted > currentCapacity', () => {
    // maxPredicted=50, default capacity=35 → risk
    const { result } = renderHook(
      () => useDemandPrediction(EXTERNAL_DATA),
      { wrapper: makeWrapper() }
    );
    expect(result.current.insights.capacityRisk).toBe(true);
  });

  it('capacityRisk is false when maxPredicted <= currentCapacity', () => {
    // maxPredicted=50, pass capacity=100 → no risk
    const { result } = renderHook(
      () => useDemandPrediction(EXTERNAL_DATA, 100),
      { wrapper: makeWrapper() }
    );
    expect(result.current.insights.capacityRisk).toBe(false);
  });

  it('capacityRisk is false when maxPredicted equals currentCapacity', () => {
    const { result } = renderHook(
      () => useDemandPrediction(EXTERNAL_DATA, 50),
      { wrapper: makeWrapper() }
    );
    // 50 > 50 is false
    expect(result.current.insights.capacityRisk).toBe(false);
  });
});
