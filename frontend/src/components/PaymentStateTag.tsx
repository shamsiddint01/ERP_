import { Tag } from 'antd';
import type { PaymentStatus, TuitionChargeStatus } from '../types';
import { formatNumber } from '../utils/format';
import { PAYMENT_STATE_COLORS, PAYMENT_STATE_LABELS, chargeOutstanding, chargeState, paymentState, type PaymentState } from '../utils/paymentState';

/** "To'langan" / "To'lanmagan". */
export function StateTag({ state }: { state: PaymentState }) {
  return <Tag color={PAYMENT_STATE_COLORS[state]}>{PAYMENT_STATE_LABELS[state]}</Tag>;
}

/** A tuition charge's state — To'langan / To'lanmagan, with what is still owed when part of it was paid. */
export function ChargeStateTag({ charge }: { charge: { status: TuitionChargeStatus; netAmount: string | number; allocations?: { amount: string | number }[] } }) {
  const state = chargeState(charge.status);
  const outstanding = chargeOutstanding(charge);
  const partlyPaid = state === 'UNPAID' && outstanding > 0 && outstanding < Number(charge.netAmount);
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <StateTag state={state} />
      {partlyPaid && <span style={{ fontSize: 12, opacity: 0.75 }}>{formatNumber(outstanding)} qoldi</span>}
    </span>
  );
}

/** A payment record's state — To'langan / To'lanmagan. */
export function PaymentStateTag({ status }: { status: PaymentStatus }) {
  return <StateTag state={paymentState(status)} />;
}
