/**
 * Cobre a correção do achado do Codex/auditoria de 5 agentes na PR #903:
 * a nav primária (com Multiplix) ficava fora do único container de rolagem,
 * encolhendo permanentemente o espaço visível dos grupos em telas baixas,
 * e um item que virou primário (Multiplix) duplicava na seção Favoritos
 * se já tivesse sido favoritado quando ainda vivia dentro de um grupo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

// ── Mocks de dependências reais do Sidebar ───────────────────────────────────

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

let mockCollapsed = false;
vi.mock('@/hooks/useSidebarState', () => ({
  useSidebarCollapse: () => ({ collapsed: mockCollapsed, toggle: vi.fn() }),
  useSidebarFavorites: () => ({
    favorites: mockFavorites,
    toggleFavorite: mockToggleFavorite,
    isFavorite: (id: string) => mockFavorites.includes(id),
    maxReached: false,
  }),
}));

let mockFavorites: string[] = [];
const mockToggleFavorite = vi.fn();

vi.mock('@/lib/evoApiHealth/useEvoApiAlertsBadge', () => ({
  useEvoApiAlertsBadge: () => ({ topSeverity: null, total: 0, critical: 0, warning: 0, info: 0 }),
}));

// Componentes pesados substituídos por stubs leves
vi.mock('@/components/notifications/PushNotificationToggle', () => ({ PushNotificationToggle: () => null }));
vi.mock('@/components/notifications/ScreenProtectionToggle', () => ({ ScreenProtectionToggle: () => null }));
vi.mock('@/components/notifications/SoundMuteToggle', () => ({ SoundMuteToggle: () => null }));
vi.mock('@/components/notifications/StatusLabelToggle', () => ({ StatusLabelToggle: () => null }));
vi.mock('./AgentProfilePopover', () => ({ AgentProfilePopover: () => null }));
vi.mock('./ConnectionStatusIndicator', () => ({ ConnectionStatusIndicator: () => null }));

// SidebarNavItem: renderiza data-tour + botão de toggle quando onToggleFavorite vem do pai
vi.mock('./SidebarNavItem', () => ({
  SidebarNavItem: ({ item, onToggleFavorite }: { item: { id: string; label: string }; onToggleFavorite?: (id: string) => void }) => (
    <div data-tour={item.id}>
      {item.label}
      {onToggleFavorite && (
        <button aria-label="Remover dos favoritos" onClick={() => onToggleFavorite(item.id)} />
      )}
    </div>
  ),
}));

// SidebarNavGroup: achata os items para que apareçam com data-tour
vi.mock('./SidebarNavGroup', () => ({
  SidebarNavGroup: ({ items }: { items: Array<{ id: string; label: string }> }) => (
    <div>{items.map((item) => <div key={item.id} data-tour={item.id}>{item.label}</div>)}</div>
  ),
}));

import { Sidebar } from '@/components/layout/Sidebar';

function baseProps() {
  return { currentView: 'inbox', onViewChange: vi.fn() };
}

function renderSidebar(props = baseProps()) {
  return render(
    <TooltipProvider><Sidebar {...props} /></TooltipProvider>,
  );
}

beforeEach(() => {
  mockCollapsed = false;
  mockFavorites = [];
  mockToggleFavorite.mockClear();
});

describe('Sidebar — nav primária e grupos compartilham uma única área de rolagem', () => {
  it('nav primária (Multiplix) e um item de grupo (chatbot) vivem dentro do .overflow-y-auto', () => {
    const { container } = renderSidebar();

    const scrollArea = container.querySelector('.overflow-y-auto');
    expect(scrollArea).not.toBeNull();

    const multiplixEl = container.querySelector('[data-tour="multiplix"]');
    const chatbotEl = container.querySelector('[data-tour="chatbot"]');
    expect(multiplixEl).not.toBeNull();
    expect(chatbotEl).not.toBeNull();
    expect(scrollArea).toContainElement(multiplixEl as HTMLElement);
    expect(scrollArea).toContainElement(chatbotEl as HTMLElement);
  });

  it('Multiplix aparece após Contatos na nav primária', () => {
    const { container } = renderSidebar();
    const tourIds = Array.from(container.querySelectorAll('[data-tour]')).map(
      (el) => el.getAttribute('data-tour'),
    );
    const contatosIdx = tourIds.indexOf('contacts');
    const multiplixIdx = tourIds.indexOf('multiplix');
    expect(contatosIdx).toBeGreaterThanOrEqual(0);
    expect(multiplixIdx).toBe(contatosIdx + 1);
  });
});

describe('Sidebar — Favoritos não duplica item que já vive na nav primária', () => {
  it('Multiplix favoritado não aparece na seção Favoritos (já é sempre visível na nav primária)', () => {
    mockFavorites = ['multiplix'];
    const { container } = renderSidebar();

    // Favoritos não deve aparecer
    expect(screen.queryByText('Favoritos')).toBeNull();
    // Multiplix aparece exatamente uma vez (na nav primária)
    expect(container.querySelectorAll('[data-tour="multiplix"]')).toHaveLength(1);
    // P2: cleanup useEffect deve ter chamado toggleFavorite para remover o id fantasma
    expect(mockToggleFavorite).toHaveBeenCalledWith('multiplix');
  });

  it('item de grupo favoritado aparece em Favoritos e pode ser desfavoritado dali', () => {
    mockFavorites = ['chatbot'];
    renderSidebar();

    const favoritosNav = screen.getByRole('navigation', { name: 'Favoritos' });
    const starButton = favoritosNav.querySelector('[aria-label="Remover dos favoritos"]');
    expect(starButton).not.toBeNull();

    fireEvent.click(starButton as HTMLElement);
    expect(mockToggleFavorite).toHaveBeenCalledWith('chatbot');
  });
});
