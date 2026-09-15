import { Descriptions } from 'antd';
import type { DescriptionsProps } from 'antd';
import type { ReactNode } from 'react';

export interface InfoGridItem {
  label: string;
  value: ReactNode;
  span?: number;
}

/** The label/value key-fact grid repeated in every detail page header — same columns, same spacing. */
export function InfoGrid({ items, column = { xs: 1, sm: 2, md: 3 } }: { items: InfoGridItem[]; column?: DescriptionsProps['column'] }) {
  return (
    <Descriptions column={column} style={{ marginTop: 16 }}>
      {items.map((item, index) => (
        <Descriptions.Item key={index} label={item.label} span={item.span}>
          {item.value ?? '—'}
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
}
