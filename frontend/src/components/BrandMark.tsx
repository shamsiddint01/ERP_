import { ReadOutlined } from '@ant-design/icons';
import { palette } from '../theme';

/**
 * Square logo tile. Shows the uploaded logo (contained, never cropped or
 * stretched) on a neutral tile, or the accent-gradient fallback icon when no
 * logo has been uploaded yet.
 */
export function BrandMark({ size = 36, logoUrl }: { size?: number; logoUrl?: string | null }) {
  const radius = Math.round(size * 0.3);
  if (logoUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          flexShrink: 0,
          background: '#fff',
          padding: Math.round(size * 0.08),
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
        }}
      >
        <img src={logoUrl} alt="Logotip" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      </div>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: palette.accentGradient,
        boxShadow: '0 8px 20px rgba(239, 91, 52, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: Math.round(size * 0.47),
        color: '#17181C',
      }}
    >
      <ReadOutlined />
    </div>
  );
}
