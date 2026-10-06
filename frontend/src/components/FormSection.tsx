import type { ReactNode } from 'react';

/** Groups a large form into labeled sections (Basic info / Relationships / Configuration / Notes) instead of one flat wall of fields. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <span className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>
        {title}
      </span>
      {children}
    </div>
  );
}
