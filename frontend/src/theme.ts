import type { ThemeConfig } from 'antd';
import type { CSSProperties } from 'react';

/**
 * Central design-token configuration (single source of truth for color,
 * radius, spacing-adjacent control sizing, and shadows) — every AntD
 * component inherits these for free via ConfigProvider, so this file alone
 * is what took the app from "default Ant Design" to a consistent, branded
 * look. Component-level overrides below exist only where a token alone
 * can't express the desired effect (e.g. Menu's active-item indicator).
 */

/**
 * Central motion system for our own custom CSS/components (index.css,
 * StatCard, page transitions, etc.) — deliberately separate from AntD's own
 * internal `token.motionDuration*`/`motionEase*` seeds, which are left
 * untouched to avoid destabilizing transitions inside AntD's own components
 * we haven't individually re-tested (Modal, Drawer, Dropdown, Tooltip...).
 */
export const motion = {
  fast: '120ms',
  normal: '180ms',
  slow: '260ms',
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Entrance stagger step between sibling sections (dashboard, etc.) — never per-row/per-card. */
  staggerStep: 30,
  /** Small translateY used by every fade-in-and-lift entrance (page-enter, stagger, state-enter). */
  distance: 6,
  /** Shared hover scale for icon badges / small reveal accents — never applied to whole cards. */
  scaleHover: 1.08,
};

/** Shared Recharts <Tooltip contentStyle=...> so every chart tooltip reads as one system, not a default browser box. */
export const chartTooltipStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #EEF0F3',
  borderRadius: 8,
  boxShadow: '0 4px 10px rgba(16,24,40,0.08), 0 2px 4px rgba(16,24,40,0.08)',
  fontSize: 12,
  padding: '8px 12px',
};
export const chartTooltipLabelStyle: CSSProperties = { fontWeight: 600, marginBottom: 4, color: '#111827' };

/**
 * Elevation system — a clear depth hierarchy instead of one shadow reused
 * everywhere. Level 0 (page background) has no shadow at all — separation
 * there comes from the page/card tonal difference alone.
 *
 *   level1 — resting cards, list rows, FormSection, ActionBar: barely-there,
 *            "gently resting on the page" (paired with a light border).
 *   level2 — hover/elevated state of a level1 surface (StatCard hover, etc).
 *   level3 — floating popups anchored to a trigger: Select/Dropdown menus,
 *            Popconfirm/Popover/Tooltip, the notification panel.
 *   level4 — surfaces that float above a dimming mask: Modal, Drawer.
 */
export const elevation = {
  level1: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.05)',
  level2: '0 4px 10px rgba(16,24,40,0.08), 0 2px 4px rgba(16,24,40,0.08)',
  level3: '0 8px 24px rgba(16,24,40,0.12), 0 3px 6px rgba(16,24,40,0.08)',
  level4: '0 24px 48px rgba(16,24,40,0.18), 0 8px 16px rgba(16,24,40,0.10)',
};

export const palette = {
  primary: '#4F46E5',
  primaryHover: '#6366F1',
  primaryActive: '#4338CA',
  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',
  info: '#0284C7',
  sidebarBg: '#111827',
  sidebarBgHover: 'rgba(255,255,255,0.06)',
  sidebarBgActive: 'rgba(79,70,229,0.35)',
  sidebarText: 'rgba(255,255,255,0.65)',
  sidebarTextActive: '#ffffff',
  layoutBg: '#F7F8FA',
  /** @deprecated use `elevation.level1` / `elevation.level2` directly — kept as aliases so existing call sites keep working. */
  cardShadow: elevation.level1,
  cardShadowHover: elevation.level2,
  /** Soft indigo-tinted band for the dashboard hero — the one place a gradient earns its keep. */
  heroGradient: 'linear-gradient(135deg, rgba(79,70,229,0.06) 0%, rgba(79,70,229,0.02) 50%, rgba(2,132,199,0.03) 100%)',
};

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: palette.primary,
    colorSuccess: palette.success,
    colorWarning: palette.warning,
    colorError: palette.error,
    colorInfo: palette.info,
    colorBgLayout: palette.layoutBg,
    borderRadius: 8,
    controlHeight: 34,
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
    fontSizeHeading1: 32,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,
    // AntD's seed shadow tokens, previously all collapsed onto the same flat
    // card-level value — now mapped onto the real elevation levels above.
    boxShadow: elevation.level1,
    boxShadowSecondary: elevation.level4,
    boxShadowTertiary: elevation.level3,
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: palette.sidebarBg,
      headerBg: '#ffffff',
      bodyBg: palette.layoutBg,
    },
    Menu: {
      darkItemBg: palette.sidebarBg,
      darkSubMenuItemBg: palette.sidebarBg,
      darkItemColor: palette.sidebarText,
      darkItemHoverColor: palette.sidebarTextActive,
      darkItemHoverBg: palette.sidebarBgHover,
      darkItemSelectedBg: palette.sidebarBgActive,
      darkItemSelectedColor: palette.sidebarTextActive,
      darkGroupTitleColor: 'rgba(255,255,255,0.35)',
      itemBorderRadius: 6,
      itemMarginInline: 8,
    },
    Card: {
      // Explicit — Card must always read as `level1`, regardless of what the
      // global tertiary token elsewhere means for Select/Dropdown/Popconfirm.
      boxShadowTertiary: elevation.level1,
      borderRadiusLG: 10,
    },
    Table: {
      headerBg: '#FAFAFB',
      headerColor: 'rgba(17,24,39,0.65)',
      rowHoverBg: '#F5F6FF',
      borderColor: '#EEF0F3',
    },
    Button: {
      controlHeight: 34,
      fontWeight: 500,
      primaryShadow: 'none',
    },
    Statistic: {
      titleFontSize: 13,
    },
    Select: {
      boxShadowSecondary: elevation.level3,
    },
    Dropdown: {
      boxShadowSecondary: elevation.level3,
    },
    Modal: {
      borderRadiusLG: 12,
      boxShadow: elevation.level4,
    },
    Drawer: {
      paddingLG: 20,
      boxShadow: elevation.level4,
    },
    // Popover/Popconfirm/Tooltip already ship their own well-designed
    // 3-layer `filter: drop-shadow(...)` (needed since a plain box-shadow
    // can't follow the arrow-pointer shape) — confirmed via direct
    // getComputedStyle inspection that it's untouched by boxShadowSecondary
    // and already reads as a properly elevated floating layer, so
    // deliberately left alone rather than fighting it with a token that
    // has no effect.
  },
};
