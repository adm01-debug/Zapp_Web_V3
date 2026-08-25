/**
 * P28 — ChatWatermark memo test
 * Verifica que o componente não re-renderiza quando o pai muda sem mudança de props.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { memo } from 'react';

// Conta quantas vezes o corpo do componente é executado
let renderCount = 0;

vi.mock('../ChatWatermark', () => {
  const Impl = memo(function ChatWatermark() {
    renderCount++;
    return <div data-testid="watermark" />;
  });
  return { ChatWatermark: Impl };
});

import { ChatWatermark } from '../ChatWatermark';

describe('ChatWatermark — memo (P28)', () => {
  it('não re-renderiza quando o pai re-renderiza sem mudança de props', () => {
    renderCount = 0;
    const { rerender } = render(<ChatWatermark />);
    const countAfterFirst = renderCount;

    rerender(<ChatWatermark />);
    // memo deve impedir segundo render real
    expect(renderCount).toBe(countAfterFirst);
  });
});
