import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useThemeStore } from '../store/theme.store';

/** Light / dark toggle in the top bar, next to the notification bell — one button showing the current mode (sun = light, moon = dark). */
export function ThemeModeSwitch() {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const isLight = mode === 'light';
  const hint = isLight ? "Qorong'i rejimga o'tish" : "Yorug' rejimga o'tish";
  return (
    <Tooltip title={hint}>
      <Button
        className="header-icon-btn"
        aria-label={hint}
        icon={
          <span key={mode} className="theme-toggle-icon">
            {isLight ? <SunOutlined /> : <MoonOutlined />}
          </span>
        }
        onClick={() => setMode(isLight ? 'dark' : 'light')}
      />
    </Tooltip>
  );
}
