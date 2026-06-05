import { View, Text, StyleSheet } from 'react-native';
import type { ExpenseStatus } from '@/types';
import { STATUS_LABEL } from '@/types';

// 通常フロー: 下書き → 申請中 → 承認済。却下時は最終ステップを差し替える。
const FLOW: ExpenseStatus[] = ['draft', 'submitted', 'approved'];

const ACCENT: Record<ExpenseStatus, string> = {
  draft: '#2563eb',
  submitted: '#f59e0b',
  approved: '#16a34a',
  rejected: '#dc2626',
};
const DONE = '#16a34a';
const TODO = '#e5e7eb';

export default function StatusStepper({ status }: { status: ExpenseStatus }) {
  const steps: ExpenseStatus[] =
    status === 'rejected' ? ['draft', 'submitted', 'rejected'] : FLOW;
  const idx = steps.indexOf(status);

  return (
    <View style={styles.row}>
      {steps.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : 'todo';
        const circleColor = state === 'todo' ? TODO : state === 'done' ? DONE : ACCENT[s];
        // 現在地に入るコネクタ(左)は完了色。却下に至る線だけ赤。
        const leftColor =
          i === 0 ? 'transparent' : i <= idx ? (i === idx && s === 'rejected' ? '#dc2626' : DONE) : TODO;
        const rightColor = i === steps.length - 1 ? 'transparent' : i < idx ? DONE : TODO;

        return (
          <View key={s} style={styles.step}>
            <View style={styles.connectorRow}>
              <View style={[styles.connector, { backgroundColor: leftColor }]} />
              <View style={[styles.circle, { backgroundColor: circleColor }]}>
                <Text style={styles.circleText}>{state === 'done' ? '✓' : i + 1}</Text>
              </View>
              <View style={[styles.connector, { backgroundColor: rightColor }]} />
            </View>
            <Text
              style={[
                styles.label,
                state === 'todo' ? styles.labelTodo : { color: state === 'done' ? '#166534' : ACCENT[s] },
                state === 'current' && styles.labelCurrent,
              ]}
            >
              {STATUS_LABEL[s]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 4 },
  step: { flex: 1, alignItems: 'center' },
  connectorRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  connector: { flex: 1, height: 2 },
  circle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  circleText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  labelTodo: { color: '#9ca3af' },
  labelCurrent: { fontSize: 13 },
});
