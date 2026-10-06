import { theme as antdTheme, type ThemeConfig } from 'antd';
import type { CSSProperties } from 'react';

/**
 * Central design-token configuration — a dark, warm "charcoal + ember"
 * system: near-black layered surfaces, soft light-gray text, and a single
 * orange→amber accent used for anything that should draw the eye (active
 * navigation, primary actions, key figures, chart highlights). Every AntD
 * component inherits these via ConfigProvider (on top of AntD's dark
 * algorithm), so pages pick up the look without per-page styling.
 */

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

/**
 * Elevation system. On a dark UI depth reads mostly from surface tone
 * (each level a step lighter), so shadows here are deep and soft — they
 * separate a surface from the page rather than "lift" it like on white.
 */
export const elevation = {
  level1: '0 1px 0 rgba(255,255,255,0.03) inset, 0 6px 18px rgba(0,0,0,0.28)',
  level2: '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 28px rgba(0,0,0,0.38)',
  level3: '0 14px 36px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.35)',
  level4: '0 28px 64px rgba(0,0,0,0.6), 0 8px 18px rgba(0,0,0,0.4)',
};

export const palette = {
  /** Amber — the one accent colour: primary buttons, active nav, focus, highlights. */
  primary: '#F5A524',
  primaryHover: '#FFB840',
  primaryActive: '#DB8D12',
  /** Ember — the warm red-orange end of the accent gradient. */
  ember: '#EF5B34',
  accentGradient: 'linear-gradient(135deg, #EF5B34 0%, #F5A524 100%)',
  accentGradientSoft: 'linear-gradient(135deg, rgba(239,91,52,0.18) 0%, rgba(245,165,36,0.10) 100%)',
  success: '#3DD68C',
  warning: '#F5A524',
  error: '#F25C4A',
  info: '#6AA8FF',

  /** Surfaces, darkest to lightest. */
  layoutBg: '#17181C',
  sidebarBg: '#131417',
  surface: '#202126',
  surfaceRaised: '#27282E',
  surfaceHover: '#2D2E35',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.12)',

  text: '#ECECEF',
  textSecondary: '#9B9DA8',
  textMuted: '#6E707B',

  sidebarBgHover: 'rgba(255,255,255,0.04)',
  sidebarBgActive: 'rgba(245,165,36,0.10)',
  sidebarText: '#8E909B',
  sidebarTextActive: '#F5A524',

  /** @deprecated use `elevation.level1` / `elevation.level2` directly — kept as aliases so existing call sites keep working. */
  cardShadow: elevation.level1,
  cardShadowHover: elevation.level2,
  /** Warm band for the dashboard hero — the one place a large gradient earns its keep. */
  heroGradient: 'linear-gradient(120deg, rgba(239,91,52,0.22) 0%, rgba(245,165,36,0.12) 45%, rgba(32,33,38,0) 100%)',
};

/**
 * Categorical series colours for multi-series charts, in this fixed order
 * (never cycled, never re-ranked). Stepped for the dark surface and
 * validated as a set with the dataviz palette validator (lightness band,
 * chroma, adjacent CVD ΔE >= 8, normal-vision ΔE >= 15, >= 3:1 contrast on
 * `surface`). Single-series charts use the brand amber (`palette.primary`).
 */
export const chartColors = ['#d95926', '#3987e5', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/** Attendance status colours — always shown with a text label, never colour alone. */
export const attendanceChartColors = { present: '#3DD68C', late: '#F5A524', absent: '#E5484D', excused: '#7C7F8C' };

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
export const chartGridStroke = 'rgba(255,255,255,0.06)';

export const themeConfig: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: palette.primary,
    colorSuccess: palette.success,
    colorWarning: palette.warning,
    colorError: palette.error,
    colorInfo: palette.info,
    colorLink: palette.primary,
    colorLinkHover: palette.primaryHover,
    colorBgBase: palette.layoutBg,
    colorBgLayout: palette.layoutBg,
    colorBgContainer: palette.surface,
    colorBgElevated: palette.surfaceRaised,
    colorBorder: 'rgba(255,255,255,0.10)',
    colorBorderSecondary: palette.border,
    colorText: palette.text,
    colorTextSecondary: palette.textSecondary,
    colorTextTertiary: palette.textMuted,
    colorTextLightSolid: '#17181C',
    borderRadius: 10,
    controlHeight: 36,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
    fontSizeHeading1: 32,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,
    fontSizeHeading4: 18,
    fontSizeHeading5: 14,
    boxShadow: elevation.level1,
    boxShadowSecondary: elevation.level4,
    boxShadowTertiary: elevation.level3,
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: palette.sidebarBg,
      headerBg: 'transparent',
      bodyBg: palette.layoutBg,
    },
    Menu: {
      darkItemBg: palette.sidebarBg,
      darkSubMenuItemBg: palette.sidebarBg,
      darkPopupBg: palette.surfaceRaised,
      darkItemColor: palette.sidebarText,
      darkItemHoverColor: palette.text,
      darkItemHoverBg: palette.sidebarBgHover,
      darkItemSelectedBg: palette.sidebarBgActive,
      darkItemSelectedColor: palette.sidebarTextActive,
      darkGroupTitleColor: palette.textMuted,
      itemBorderRadius: 10,
      itemMarginInline: 12,
      itemHeight: 42,
      iconSize: 16,
    },
    Card: {
      colorBgContainer: palette.surface,
      boxShadowTertiary: elevation.level1,
      borderRadiusLG: 14,
      headerFontSize: 13,
    },
    Table: {
      headerBg: palette.surface,
      headerColor: palette.textMuted,
      headerSplitColor: 'transparent',
      rowHoverBg: palette.surfaceHover,
      borderColor: palette.border,
      colorBgContainer: palette.surface,
    },
    Button: {
      controlHeight: 36,
      fontWeight: 600,
      primaryShadow: '0 6px 16px rgba(245,165,36,0.22)',
      primaryColor: '#17181C',
      defaultBg: palette.surfaceRaised,
      defaultBorderColor: 'rgba(255,255,255,0.10)',
      defaultColor: palette.text,
    },
    Input: { colorBgContainer: palette.surfaceRaised, activeShadow: '0 0 0 3px rgba(245,165,36,0.15)' },
    InputNumber: { colorBgContainer: palette.surfaceRaised, activeShadow: '0 0 0 3px rgba(245,165,36,0.15)' },
    Select: {
      colorBgContainer: palette.surfaceRaised,
      optionSelectedBg: 'rgba(245,165,36,0.14)',
      optionSelectedColor: palette.primary,
      boxShadowSecondary: elevation.level3,
    },
    DatePicker: { colorBgContainer: palette.surfaceRaised, activeShadow: '0 0 0 3px rgba(245,165,36,0.15)' },
    Tabs: {
      itemColor: palette.textSecondary,
      itemHoverColor: palette.text,
      itemSelectedColor: palette.primary,
      inkBarColor: palette.primary,
    },
    Statistic: {
      titleFontSize: 12,
    },
    Tag: {
      defaultBg: 'rgba(255,255,255,0.06)',
    },
    Dropdown: {
      boxShadowSecondary: elevation.level3,
    },
    Modal: {
      contentBg: palette.surface,
      headerBg: palette.surface,
      borderRadiusLG: 16,
      boxShadow: elevation.level4,
    },
    Drawer: {
      colorBgElevated: palette.surface,
      paddingLG: 20,
      boxShadow: elevation.level4,
    },
    Descriptions: {
      labelColor: palette.textMuted,
    },
    Segmented: {
      itemSelectedBg: palette.surfaceHover,
      trackBg: palette.sidebarBg,
    },
  },
};
