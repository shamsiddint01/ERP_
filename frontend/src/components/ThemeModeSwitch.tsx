import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Segmented, Tooltip } from 'antd';
import { useThemeStore } from '../store/theme.store';
import type { ThemeMode } from '../theme';

/** Light / dark switch in the top bar, next to the notification bell — for every role. */
export function ThemeModeSwitch() {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  return (
    <Segmented<ThemeMode>
      size="small"
      value={mode}
      onChange={setMode}
      aria-label="Ko'rinish"
      options={[
        {
          value: 'dark',
          label: (
            <Tooltip title="Qorong'i rejim">
              <MoonOutlined aria-label="Qorong'i" />
            </Tooltip>
          ),
        },
        {
          value: 'light',
          label: (
            <Tooltip title="Yorug' rejim">
              <SunOutlined aria-label="Yorug'" />
            </Tooltip>
          ),
        },
      ]}
    />
  );
}
