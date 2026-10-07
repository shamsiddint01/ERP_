import { theme as antdTheme, type ThemeConfig } from 'antd';
import type { CSSProperties } from 'react';

/**
 * Central design-token configuration, in two modes:
 *
 *   dark  — near-black layered surfaces, light-gray text (the default);
 *   light — warm off-white page, white surfaces, near-black text.
 *
 * Both share one orange→amber accent. Colours reach the UI two ways:
 *   - `palette.*` is a set of CSS variable references (defined for both modes
 *     in index.css under :root / :root[data-theme="light"]), so every inline
 *     style switches instantly when the mode flips — no re-render needed;
 *   - `getThemeConfig(mode)` feeds AntD real colour values for that mode
 *     (AntD derives hover/active shades from them, which CSS variables can't do).
 * Keep MODE_COLORS and the variables in index.css in sync.
 */
export type ThemeMode = 'dark' | 'light';

/**
 * Central motion system for our own custom CSS/components (index.css,
 * StatCard, page transitions, etc.) — deliberately separate from AntD's own
 * internal motion seeds, which are left untouched.
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

/** Elevation levels (index.css defines a softer set for light mode under the same names). */
export const elevation = {
  level1: 'var(--elevation-1)',
  level2: 'var(--elevation-2)',
  level3: 'var(--elevation-3)',
  level4: 'var(--elevation-4)',
};

const MODE_COLORS = {
  dark: {
    primary: '#F5A524',
    primaryHover: '#FFB840',
    ember: '#EF5B34',
    success: '#3DD68C',
    warning: '#F5A524',
    error: '#F25C4A',
    info: '#6AA8FF',
    layoutBg: '#17181C',
    sidebarBg: '#131417',
    surface: '#202126',
    surfaceRaised: '#27282E',
    surfaceHover: '#2D2E35',
    border: 'rgba(255,255,255,0.07)',
    borderControl: 'rgba(255,255,255,0.10)',
    text: '#ECECEF',
    textSecondary: '#9B9DA8',
    textMuted: '#6E707B',
    sidebarText: '#8E909B',
    sidebarBgHover: 'rgba(255,255,255,0.04)',
    sidebarBgActive: 'rgba(245,165,36,0.10)',
    tagBg: 'rgba(255,255,255,0.06)',
    shadows: ['0 1px 0 rgba(255,255,255,0.03) inset, 0 6px 18px rgba(0,0,0,0.28)', '0 14px 36px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.35)', '0 28px 64px rgba(0,0,0,0.6), 0 8px 18px rgba(0,0,0,0.4)'],
  },
  light: {
    primary: '#DB8A00',
    primaryHover: '#F09A0C',
    ember: '#E5532D',
    success: '#1E9E63',
    warning: '#D98A00',
    error: '#D93A2B',
    info: '#2F7AE5',
    layoutBg: '#F5F3EF',
    sidebarBg: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceRaised: '#F8F6F2',
    surfaceHover: '#F2EFE9',
    border: 'rgba(28,29,34,0.08)',
    borderControl: 'rgba(28,29,34,0.14)',
    text: '#1C1D22',
    textSecondary: '#5C5F6A',
    textMuted: '#8A8D97',
    sidebarText: '#5C5F6A',
    sidebarBgHover: 'rgba(28,29,34,0.04)',
    sidebarBgActive: 'rgba(219,138,0,0.12)',
    tagBg: 'rgba(28,29,34,0.05)',
    shadows: ['0 1px 2px rgba(28,29,34,0.05), 0 4px 12px rgba(28,29,34,0.05)', '0 12px 28px rgba(28,29,34,0.12), 0 2px 6px rgba(28,29,34,0.06)', '0 24px 56px rgba(28,29,34,0.18), 0 8px 18px rgba(28,29,34,0.08)'],
  },
} as const;

/** CSS-variable references — use these in inline styles; they follow the active mode. */
export const palette = {
  /** Amber — the one accent colour: primary buttons, active nav, focus, highlights. */
  primary: 'var(--color-primary)',
  primaryHover: 'var(--color-primary-hover)',
  /** Ember — the warm red-orange end of the accent gradient. */
  ember: 'var(--color-ember)',
  accentGradient: 'linear-gradient(135deg, #EF5B34 0%, #F5A524 100%)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',

  layoutBg: 'var(--color-bg)',
  sidebarBg: 'var(--color-sidebar)',
  surface: 'var(--color-surface)',
  surfaceRaised: 'var(--color-surface-raised)',
  surfaceHover: 'var(--color-surface-hover)',
  border: 'var(--color-border)',
  borderStrong: 'var(--color-border-strong)',

  text: 'var(--color-text)',
  textSecondary: 'var(--color-text-secondary)',
  textMuted: 'var(--color-text-muted)',

  sidebarBgHover: 'var(--sidebar-bg-hover)',
  sidebarBgActive: 'var(--sidebar-bg-active)',
  sidebarText: 'var(--sidebar-text)',
  sidebarTextActive: 'var(--color-primary)',

  /** Warm band for hero cards — the one place a large gradient earns its keep. */
  heroGradient: 'var(--hero-gradient)',
};

/**
 * A translucent tint of any colour (hex or CSS variable), e.g. icon-badge
 * backgrounds: `tint(palette.primary, 12)`.
 */
export function tint(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/**
 * Categorical series colours for multi-series charts, in this fixed order
 * (never cycled, never re-ranked). Validated as a set with the dataviz
 * palette validator (lightness band, chroma, adjacent CVD ΔE >= 8,
 * normal-vision ΔE >= 15, >= 3:1 contrast). Single-series charts use the
 * brand amber (`palette.primary`).
 */
export const chartColors = ['#d95926', '#3987e5', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/** Attendance status colours — always shown with a text label, never colour alone. */
export const attendanceChartColors = { present: '#2FBF7A', late: '#E99A1A', absent: '#E5484D', excused: '#7C7F8C' };

/** Shared Recharts <Tooltip contentStyle=...> so every chart tooltip reads as one system. */
export const chartTooltipStyle: CSSProperties = {
  background: palette.surfaceRaised,
  border: `1px solid ${palette.borderStrong}`,
  borderRadius: 10,
  boxShadow: elevation.level3,
  fontSize: 12,
  padding: '8px 12px',
  color: palette.text,
};
export const chartTooltipLabelStyle: CSSProperties = { fontWeight: 600, marginBottom: 4, color: palette.text };
/** Axis tick / grid styling shared by every Recharts chart. */
export const chartAxisTick = { fill: palette.textMuted, fontSize: 11 };
export const chartGridStroke = 'var(--chart-grid)';
/** Hover cursor band behind bars. */
export const chartCursorFill = 'var(--chart-cursor)';

export function getThemeConfig(mode: ThemeMode): ThemeConfig {
  const c = MODE_COLORS[mode];
  const [shadow1, shadow3, shadow4] = c.shadows;
  const focus = `0 0 0 3px ${mode === 'dark' ? 'rgba(245,165,36,0.15)' : 'rgba(219,138,0,0.16)'}`;
  const menu =
    mode === 'dark'
      ? {
          darkItemBg: c.sidebarBg,
          darkSubMenuItemBg: c.sidebarBg,
          darkPopupBg: c.surfaceRaised,
          darkItemColor: c.sidebarText,
          darkItemHoverColor: c.text,
          darkItemHoverBg: c.sidebarBgHover,
          darkItemSelectedBg: c.sidebarBgActive,
          darkItemSelectedColor: c.primary,
          darkGroupTitleColor: c.textMuted,
        }
      : {
          itemBg: c.sidebarBg,
          subMenuItemBg: c.sidebarBg,
          itemColor: c.sidebarText,
          itemHoverColor: c.text,
          itemHoverBg: c.sidebarBgHover,
          itemSelectedBg: c.sidebarBgActive,
          itemSelectedColor: c.primary,
          groupTitleColor: c.textMuted,
        };

  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: c.primary,
      colorSuccess: c.success,
      colorWarning: c.warning,
      colorError: c.error,
      colorInfo: c.info,
      colorLink: c.primary,
      colorLinkHover: c.primaryHover,
      colorBgBase: c.layoutBg,
      colorBgLayout: c.layoutBg,
      colorBgContainer: c.surface,
      colorBgElevated: mode === 'dark' ? c.surfaceRaised : c.surface,
      colorBorder: c.borderControl,
      colorBorderSecondary: c.border,
      colorText: c.text,
      colorTextSecondary: c.textSecondary,
      colorTextTertiary: c.textMuted,
      colorTextLightSolid: mode === 'dark' ? '#17181C' : '#FFFFFF',
      borderRadius: 10,
      controlHeight: 36,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      fontSize: 14,
      fontSizeHeading1: 32,
      fontSizeHeading2: 24,
      fontSizeHeading3: 20,
      fontSizeHeading4: 18,
      fontSizeHeading5: 14,
      boxShadow: shadow1,
      boxShadowSecondary: shadow4,
      boxShadowTertiary: shadow3,
      wireframe: false,
    },
    components: {
      Layout: { siderBg: c.sidebarBg, headerBg: 'transparent', bodyBg: c.layoutBg },
      Menu: { ...menu, itemBorderRadius: 10, itemMarginInline: 12, itemHeight: 42, iconSize: 16 },
      Card: { colorBgContainer: c.surface, boxShadowTertiary: shadow1, borderRadiusLG: 14, headerFontSize: 13 },
      Table: { headerBg: c.surface, headerColor: c.textMuted, headerSplitColor: 'transparent', rowHoverBg: c.surfaceHover, borderColor: c.border, colorBgContainer: c.surface },
      Button: {
        controlHeight: 36,
        fontWeight: 600,
        primaryShadow: mode === 'dark' ? '0 6px 16px rgba(245,165,36,0.22)' : '0 6px 14px rgba(219,138,0,0.22)',
        primaryColor: mode === 'dark' ? '#17181C' : '#FFFFFF',
        defaultBg: c.surfaceRaised,
        defaultBorderColor: c.borderControl,
        defaultColor: c.text,
      },
      Input: { colorBgContainer: c.surfaceRaised, activeShadow: focus },
      InputNumber: { colorBgContainer: c.surfaceRaised, activeShadow: focus },
      Select: { colorBgContainer: c.surfaceRaised, optionSelectedBg: c.sidebarBgActive, optionSelectedColor: c.primary, boxShadowSecondary: shadow3 },
      DatePicker: { colorBgContainer: c.surfaceRaised, activeShadow: focus },
      Tabs: { itemColor: c.textSecondary, itemHoverColor: c.text, itemSelectedColor: c.primary, inkBarColor: c.primary },
      Statistic: { titleFontSize: 12 },
      Tag: { defaultBg: c.tagBg },
      Dropdown: { boxShadowSecondary: shadow3 },
      Modal: { contentBg: c.surface, headerBg: c.surface, borderRadiusLG: 16, boxShadow: shadow4 },
      Drawer: { colorBgElevated: c.surface, paddingLG: 20, boxShadow: shadow4 },
      Descriptions: { labelColor: c.textMuted },
      Segmented: { itemSelectedBg: mode === 'dark' ? c.surfaceHover : c.surface, trackBg: mode === 'dark' ? c.sidebarBg : c.surfaceHover },
    },
  };
}
