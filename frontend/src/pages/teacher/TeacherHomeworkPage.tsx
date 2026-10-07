import { useQuery } from '@tanstack/react-query';
import { Progress, Segmented, Select, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { listHomework } from '../../api/homework';
import { EmptyState } from '../../components/EmptyState';
import { HomeworkSubmissionsDrawer } from '../../components/HomeworkSubmissionsDrawer';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import { palette } from '../../theme';
import type { HomeworkListItem } from '../../types';
import { formatDateTime } from '../../utils/format';

type Filter = 'toCheck' | 'checked' | 'all';

const FILTERS: Record<Filter, (h: HomeworkListItem) => boolean> = {
  toCheck: (h) => h.submittedCount > h.gradedCount,
  checked: (h) => h.submittedCount > 0 && h.submittedCount === h.gradedCount,
  all: () => true,
};

/** Teacher → "Uy ishi": every homework of the teacher's groups, focused on checking (opening answers and grading). Assigning lives on the group page. */
export function TeacherHomeworkPage() {
  const canGrade = useAuthStore((state) => state.hasPermission('homework', 'EDIT'));
  const [filter, setFilter] = useState<Filter>('toCheck');
  const [groupId, setGroupId] = useState<string | undefined>();
  const [reviewing, setReviewing] = useState<HomeworkListItem | null>(null);

  const homeworkQuery = useQuery({ queryKey: ['homework', { pageSize: 100 }], queryFn: () => listHomework({ pageSize: 100 }) });
  const items = homeworkQuery.data?.items ?? [];

  const groups = [...new Map(items.map((h) => [h.group.id, h.group.name]))].map(([value, label]) => ({ value, label }));
  const inGroup = items.filter((h) => !groupId || h.groupId === groupId);
  const count = (key: Filter) => inGroup.filter(FILTERS[key]).length;
  const visible = inGroup.filter(FILTERS[filter]);

  if (homeworkQuery.isError) return <PageErrorState onRetry={() => homeworkQuery.refetch()} />;

  return (
    <div>
      <PageHeader title="Uy ishi" subtitle="O'quvchilar topshirgan javoblarni tekshiring va baholang" />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'toCheck', label: `Tekshirish kerak (${count('toCheck')})` },
            { value: 'checked', label: `Tekshirilgan (${count('checked')})` },
            { value: 'all', label: `Barchasi (${count('all')})` },
          ]}
        />
        <Select allowClear placeholder="Barcha guruhlar" style={{ minWidth: 200 }} value={groupId} onChange={setGroupId} options={groups} />
      </div>
      <Table<HomeworkListItem>
        rowKey="id"
        loading={homeworkQuery.isLoading}
        dataSource={visible}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <EmptyState title={filter === 'toCheck' ? "Tekshirilmagan javob yo'q" : "Uy ishi yo'q"} /> }}
        onRow={(record) => ({ onClick: () => setReviewing(record), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Vazifa',
            render: (_, r) => (
              <div>
                <div style={{ fontWeight: 600 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: palette.textMuted }}>{r.group.name}</div>
              </div>
            ),
          },
          {
            title: 'Muddat',
            render: (_, r) => <span style={{ color: dayjs(r.dueDate).isBefore(dayjs()) ? palette.textMuted : undefined }}>{formatDateTime(r.dueDate)}</span>,
          },
          {
            title: 'Topshirdi',
            width: 170,
            render: (_, r) => (
              <Progress
                percent={r.rosterSize ? Math.round((r.submittedCount / r.rosterSize) * 100) : 0}
                size="small"
                format={() => `${r.submittedCount}/${r.rosterSize}`}
                strokeColor={palette.primary}
              />
            ),
          },
          {
            title: 'Baholandi',
            render: (_, r) =>
              r.submittedCount === 0 ? '—' : r.gradedCount === r.submittedCount ? <Tag color="green">Hammasi</Tag> : <Tag color="gold">{r.submittedCount - r.gradedCount} ta kutmoqda</Tag>,
          },
        ]}
      />
      <HomeworkSubmissionsDrawer homework={reviewing} canGrade={canGrade} onClose={() => setReviewing(null)} />
    </div>
  );
}
