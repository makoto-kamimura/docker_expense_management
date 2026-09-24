import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { STATUS_GROUP, STATUS_HINT, statusLabel, type RequestKind, type RequestStatus } from '@/types';

// Web (globals.css) と同じ GitHub (Primer) の配色
export const C = {
  fg: '#1f2328',
  muted: '#59636e',
  border: '#d1d9e0',
  borderMuted: '#d1d9e0b3',
  bg: '#f6f8fa',
  card: '#ffffff',
  accent: '#0969da',
  green: '#1f883d',
  yellow: '#9a6700',
  red: '#d1242f',
  purple: '#8250df',
  gray: '#59636e',
};

// GitHub の PR 状態色: Open = 緑 / Draft = 灰 / Merged = 紫 / Closed = 赤
const GROUP_COLOR = { open: C.green, draft: C.gray, merged: C.purple, done: C.accent, closed: '#cf222e' };
export const STATUS_COLOR = Object.fromEntries(
  Object.entries(STATUS_GROUP).map(([k, g]) => [k, GROUP_COLOR[g]]),
) as Record<RequestStatus, string>;

export function StatusBadge({ status, kind = 'purchase', hint }: { status: RequestStatus; kind?: RequestKind; hint?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Text style={[s.status, { backgroundColor: STATUS_COLOR[status] }]}>{statusLabel(kind, status)}</Text>
      {hint && <Text style={s.ja}>{STATUS_HINT[status]}</Text>}
    </View>
  );
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: C.muted, fontWeight: '600', fontSize: size * 0.45 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

type Variant = 'default' | 'primary' | 'merge' | 'danger' | 'blue';
const VARIANT: Record<Variant, { bg: string; fg: string; border: string }> = {
  default: { bg: C.bg, fg: C.fg, border: C.border },
  primary: { bg: C.green, fg: '#fff', border: C.green },
  merge: { bg: C.purple, fg: '#fff', border: C.purple },
  danger: { bg: '#fff', fg: C.red, border: C.border },
  blue: { bg: C.accent, fg: '#fff', border: C.accent },
};

export function Button({
  title,
  onPress,
  variant = 'default',
  disabled,
  busy,
  size = 'md',
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  /** sm = 画面上部のナビゲーションなど、控えめに置くボタン */
  size?: 'md' | 'sm';
  style?: ViewStyle;
}) {
  const v = VARIANT[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        s.btn,
        size === 'sm' && s.btnSm,
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={v.fg} /> : <Text style={[s.btnText, size === 'sm' && s.btnTextSm, { color: v.fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ title, ja, right, children }: { title?: string; ja?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      {title && (
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>
            {title} {ja && <Text style={s.ja}>{ja}</Text>}
          </Text>
          {right}
        </View>
      )}
      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

export function Fact({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <View style={[s.fact, last && { borderBottomWidth: 0 }]}>
      <Text style={s.factLabel}>{label}</Text>
      {typeof value === 'string' ? <Text style={s.factValue}>{value}</Text> : <View style={{ flex: 1 }}>{value}</View>}
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  status: { color: '#fff', fontWeight: '500', fontSize: 13, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  ja: { color: C.muted, fontSize: 12, fontWeight: '400' },
  muted: { color: C.muted, fontSize: 13 },
  avatar: { backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btn: { borderWidth: 1, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  btnText: { fontWeight: '600', fontSize: 14 },
  btnSm: { paddingVertical: 6, paddingHorizontal: 10, minHeight: 32 },
  btnTextSm: { fontSize: 13 },
  card: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 6, marginBottom: 12, overflow: 'hidden' },
  cardHead: { backgroundColor: C.bg, borderBottomColor: C.borderMuted, borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: '600', fontSize: 15, color: C.fg, flexShrink: 1 },
  cardBody: { padding: 14 },
  fact: { flexDirection: 'row', paddingVertical: 6, borderBottomColor: C.borderMuted, borderBottomWidth: 1, gap: 12 },
  factLabel: { width: 110, color: C.muted, fontSize: 13 },
  factValue: { flex: 1, color: C.fg, fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: C.fg, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderColor: C.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: C.fg },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  link: { color: C.accent },
  error: { backgroundColor: '#ffebe9', color: C.red, padding: 10, borderRadius: 6, marginBottom: 12, overflow: 'hidden' },
  chip: { borderColor: C.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipOn: { borderColor: C.accent, backgroundColor: '#ddf4ff' },
  chipText: { fontSize: 13, color: C.fg },
  chipTextOn: { color: C.accent, fontWeight: '700' },
});
