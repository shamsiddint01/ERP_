import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Segmented } from 'antd';
import { useThemeStore } from '../store/theme.store';
import type { ThemeMode } from '../theme';

/** The light / dark switch shown in every role's Sozlamalar. */
export function ThemeModeSwitch() {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  return (
    <Segmented<ThemeMode>
      value={mode}
      onChange={setMode}
      options={[
        { value: 'dark', label: "Qorong'i", icon: <MoonOutlined /> },
        { value: 'light', label: "Yorug'", icon: <SunOutlined /> },
      ]}
    />
  );
}
