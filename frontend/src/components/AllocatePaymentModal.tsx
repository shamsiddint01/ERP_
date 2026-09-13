import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, InputNumber, Modal, Table, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { allocatePayment } from '../api/payments';
import { getStudentFinancialSummary } from '../api/tuition';
import type { Payment } from '../types';

interface AllocatePaymentModalProps {
  open: boolean;
  onClose: () => void;
  payment: Payment | null;
}

/**
 * Lets the user spread a TUITION_CHARGE payment's still-unallocated amount
 * across that student's outstanding charges — the UI for POST
 * /payments/:id/allocate. `payment.referenceId` is the payer Student's id
 * (see api/payments.ts's own note on this), never a specific charge, which
 * is exactly why this separate action exists.
 */
export function AllocatePaymentModal({ open, onClose, payment }: AllocatePaymentModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const summaryQuery = useQuery({
    queryKey: ['student-financial-summary', payment?.referenceId],
    queryFn: () => getStudentFinancialSummary(payment!.referenceId!),
    enabled: open && !!payment?.referenceId,
  });

  useEffect(() => {
    if (open) setAmounts({});
  }, [open, payment?.id]);

  const outstandingCharges = useMemo(() => (summaryQuery.data?.charges ?? []).filter((c) => c.outstanding > 0), [summaryQuery.data]);

  const paymentAllocated = useMemo(
    () => summaryQuery.data?.payments.find((p) => p.id === payment?.id)?.allocatedAmount ?? 0,
    [summaryQuery.data, payment],
  );
  const unallocated = payment ? Number(payment.amount) - paymentAllocated : 0;
  const totalEntered = Object.values(amounts).reduce((sum, v) => sum + (v || 0), 0);

  const mutation = useMutation({
    mutationFn: () =>
      allocatePayment(payment!.id, {
        allocations: Object.entries(amounts)
          .filter(([, amount]) => amount > 0)
          .map(([tuitionChargeId, amount]) => ({ tuitionChargeId, amount })),
      }),
    onSuccess: () => {
      message.success("To'lov hisoblarga taqsimlandi");
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['tuition-charges'] });
      queryClient.invalidateQueries({ queryKey: ['tuition-charge'] });
      queryClient.invalidateQueries({ queryKey: ['student-balance'] });
      queryClient.invalidateQueries({ queryKey: ['student-financial-summary'] });
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Taqsimlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={`To'lovni taqsimlash — ${payment?.paymentNumber ?? ''}`}
      open={open}
      onCancel={onClose}
      onOk={() => mutation.mutate()}
      confirmLoading={mutation.isPending}
      okButtonProps={{ disabled: totalEntered <= 0 || totalEntered > unallocated + 0.001 }}
      width={640}
      destroyOnHidden
    >
      <Alert
        style={{ marginBottom: 12 }}
        type={totalEntered > unallocated + 0.001 ? 'error' : 'info'}
        message={`Taqsimlanmagan: ${unallocated.toLocaleString('uz-UZ')} · Kiritilgan: ${totalEntered.toLocaleString('uz-UZ')}`}
      />
      <Table
        size="small"
        rowKey="id"
        loading={summaryQuery.isLoading}
        dataSource={outstandingCharges}
        pagination={false}
        locale={{ emptyText: "Bu o'quvchida taqsimlanmagan hisob yo'q" }}
        columns={[
          { title: 'Davr', dataIndex: 'billingPeriod' },
          { title: 'Guruh', render: (_, record) => record.enrollment.group.name },
          { title: 'Qoldiq', dataIndex: 'outstanding', render: (v: number) => v.toLocaleString('uz-UZ') },
          {
            title: 'Taqsimlash summasi',
            render: (_, record) => (
              <InputNumber
                min={0}
                max={Math.min(record.outstanding, unallocated)}
                style={{ width: '100%' }}
                value={amounts[record.id] ?? 0}
                onChange={(v) => setAmounts((prev) => ({ ...prev, [record.id]: v ?? 0 }))}
              />
            ),
          },
        ]}
      />
      {!payment?.referenceId && <Typography.Text type="secondary">Bu to'lov hech qanday o'quvchiga bog'lanmagan.</Typography.Text>}
    </Modal>
  );
}
