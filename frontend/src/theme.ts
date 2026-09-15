import type { ThemeConfig } from 'antd';

/**
 * Central design-token configuration (single source of truth for color,
 * radius, spacing-adjacent control sizing, and shadows) — every AntD
 * component inherits these for free via ConfigProvider, so this file alone
 * is what took the app from "default Ant Design" to a consistent, branded
 * look. Component-level overrides below exist only where a token alone
 * can't express the desired effect (e.g. Menu's active-item indicator).
 */

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
  cardShadow: '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.08)',
  cardShadowHover: '0 4px 10px rgba(16,24,40,0.08), 0 2px 4px rgba(16,24,40,0.08)',
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
    boxShadow: palette.cardShadow,
    boxShadowSecondary: palette.cardShadow,
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
      boxShadowTertiary: palette.cardShadow,
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
    Modal: {
      borderRadiusLG: 12,
    },
    Drawer: {
      paddingLG: 20,
    },
  },
};
