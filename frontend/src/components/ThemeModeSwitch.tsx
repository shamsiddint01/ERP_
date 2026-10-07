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
      <Button type="text" shape="circle" aria-label={hint} icon={isLight ? <SunOutlined /> : <MoonOutlined />} onClick={() => setMode(isLight ? 'dark' : 'light')} />
    </Tooltip>
  );
}
