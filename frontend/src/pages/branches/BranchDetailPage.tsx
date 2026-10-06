import { EditOutlined, GroupOutlined, HomeOutlined, PlusOutlined, StopOutlined, TeamOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Popconfirm, Spin, Table, Tag } from 'antd';
import { EmptyState } from '../../components/EmptyState';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deactivateBranch, getBranch } from '../../api/branches';
import { ActionBar } from '../../components/ActionBar';
import { BranchFormModal } from '../../components/BranchFormModal';
import { ClassroomFormModal } from '../../components/ClassroomFormModal';
import { DetailHeader } from '../../components/DetailHeader';
import { DetailSection } from '../../components/DetailSection';
import { InfoGrid } from '../../components/InfoGrid';
import { PageErrorState } from '../../components/PageErrorState';
import { SummaryCard } from '../../components/SummaryCard';
import { palette } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import type { BranchStatus, ClassroomStatus } from '../../types';

const STATUS_COLORS: Record<BranchStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<BranchStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol' };
const CLASSROOM_STATUS_COLORS: Record<ClassroomStatus, string> = { ACTIVE: 'green', INACTIVE: 'default', MAINTENANCE: 'gold' };

export function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);
  const [classroomModalOpen, setClassroomModalOpen] = useState(false);

  const branchQuery = useQuery({ queryKey: ['branch', id], queryFn: () => getBranch(id!), enabled: !!id });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateBranch(id!),
    onSuccess: () => {
      message.success('Filial nofaol qilindi');
      queryClient.invalidateQueries({ queryKey: ['branch', id] });
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Amalni bajarib bo'lmadi");
    },
  });

  if (branchQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (branchQuery.isError) {
    return <PageErrorState onRetry={() => branchQuery.refetch()} />;
  }

  const branch = branchQuery.data;
  if (!branch) return null;

  const canEdit = hasPermission('branches', 'EDIT');

  return (
    <div>
      <DetailHeader
        backLabel="Orqaga"
        onBack={() => navigate(-1)}
        title={
          <>
            {branch.name} <Tag>{branch.code}</Tag>
          </>
        }
        subtitle={branch.address ?? 'Manzil kiritilmagan'}
        actions={
          <ActionBar>
            <Tag color={STATUS_COLORS[branch.status]}>{STATUS_LABELS[branch.status]}</Tag>
            {canEdit && (
              <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                Tahrirlash
              </Button>
            )}
            {canEdit && branch.status !== 'INACTIVE' && (
              <Popconfirm title="Filialni nofaol qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
                <Button loading={deactivateMutation.isPending} danger icon={<StopOutlined />}>
                  Nofaol qilish
                </Button>
              </Popconfirm>
            )}
          </ActionBar>
        }
      >
        <InfoGrid
          items={[
            { label: 'Telefon', value: branch.phone },
            { label: 'Email', value: branch.email },
            { label: 'Ish vaqti', value: branch.workingHours },
            { label: 'Rahbar', value: branch.managerEmployee?.fullName },
            ...(branch.notes ? [{ label: 'Izoh', value: branch.notes, span: 2 }] : []),
          ]}
        />
      </DetailHeader>

      <SummaryCard
        items={[
          { icon: <HomeOutlined />, label: 'Xonalar soni', value: branch.classrooms.length, color: palette.info },
          { icon: <TeamOutlined />, label: "O'quvchilar soni", value: branch._count.students, color: palette.primary },
          { icon: <GroupOutlined />, label: 'Faol guruhlar soni', value: branch.activeGroupCount, color: palette.success },
        ]}
      />

      <DetailSection
        title="Xonalar"
        extra={
          canEdit && (
            <Button size="small" icon={<PlusOutlined />} onClick={() => setClassroomModalOpen(true)}>
              Yangi xona
            </Button>
          )
        }
      >
        {branch.classrooms.length ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={branch.classrooms}
            onRow={(record) => ({ onClick: () => navigate(`/classrooms/${record.id}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Nomi', dataIndex: 'name' },
              { title: 'Xona raqami', dataIndex: 'roomNumber' },
              { title: "Sig'imi", dataIndex: 'capacity' },
              { title: 'Status', dataIndex: 'status', render: (v: ClassroomStatus) => <Tag color={CLASSROOM_STATUS_COLORS[v]}>{v}</Tag> },
            ]}
          />
        ) : (
          <EmptyState title="Xonalar hali qo'shilmagan" />
        )}
      </DetailSection>

      <BranchFormModal open={editOpen} onClose={() => setEditOpen(false)} branch={branch} />
      <ClassroomFormModal open={classroomModalOpen} onClose={() => setClassroomModalOpen(false)} defaultBranchId={branch.id} />
    </div>
  );
}
