import { Tabs } from 'antd';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';
import { useAuthStore } from '../store/auth.store';

export interface SectionHubTab {
  key: string;
  label: string;
  icon?: ReactNode;
  /** The permission this tab needs — the tab is hidden entirely without it. */
  permission: { module: string; action: string };
  element: ReactNode;
}

/**
 * One sidebar section that groups several related pages behind tabs
 * (e.g. To'lovlar = payments / charges / balances / discounts). The active
 * tab lives in `?tab=` so a deep link or the browser back button lands on
 * the right one; tabs the caller has no permission for are never shown.
 */
export function SectionHub({ tabs }: { tabs: SectionHubTab[] }) {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [searchParams, setSearchParams] = useSearchParams();

  const allowed = tabs.filter((tab) => hasPermission(tab.permission.module, tab.permission.action));
  if (allowed.length === 0) return <AccessDeniedPage />;

  const requested = searchParams.get('tab');
  const active = allowed.find((tab) => tab.key === requested) ?? allowed[0];

  return (
    <div>
      {allowed.length > 1 && (
        <Tabs
          className="section-hub-tabs"
          activeKey={active.key}
          onChange={(key) => setSearchParams({ tab: key }, { replace: true })}
          items={allowed.map((tab) => ({
            key: tab.key,
            label: (
              <span>
                {tab.icon}
                {tab.icon ? ' ' : ''}
                {tab.label}
              </span>
            ),
          }))}
        />
      )}
      <div key={active.key} className="state-enter">
        {active.element}
      </div>
    </div>
  );
}
