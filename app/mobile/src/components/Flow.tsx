import { Pressable, Text, View } from 'react-native';
import { flowSteps, type FlowPhase, type FlowState } from '@/format';
import type { RequestDetail } from '@/types';
import { C, TurnChip, s } from './ui';

/**
 * 稟議の流れ「申請 → 承認 → 実行」。誰が動く段か・どこまで進んだかを詳細画面の上に出す (Web の FlowSteps と同じ)。
 * 段を押すと、その段の中身 (selected) に切り替える
 */
export function FlowSteps({ d, meId, selected, onSelect }: { d: RequestDetail; meId: string; selected: FlowPhase; onSelect: (phase: FlowPhase) => void }) {
  const mark: Record<FlowState, { bg: string; fg: string; text: string }> = {
    done: { bg: C.green, fg: '#fff', text: '✓' },
    current: { bg: C.attentionSubtle, fg: C.yellow, text: '●' },
    todo: { bg: C.bg, fg: C.muted, text: '○' },
    stopped: { bg: C.closed, fg: '#fff', text: '✕' },
  };
  return (
    <View style={{ backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
      {flowSteps(d).map((st, i) => {
        const current = st.state === 'current';
        const mine = current && d.my_turn && st.people.some((p) => p.id === meId);
        const on = st.phase === selected;
        const m = mark[st.state];
        return (
          <Pressable
            key={st.phase}
            onPress={() => onSelect(st.phase)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${i + 1}. ${st.title} ${st.note}`}
            style={{
              flexDirection: 'row', gap: 10, padding: 10,
              backgroundColor: on ? C.accentSubtle : 'transparent',
              borderTopWidth: i ? 1 : 0, borderTopColor: C.borderMuted,
              borderLeftWidth: 3, borderLeftColor: current ? C.attentionBorder : 'transparent',
            }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: m.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: st.state === 'todo' ? C.border : 'transparent' }}>
              <Text style={{ color: m.fg, fontSize: 11, fontWeight: '700' }}>{m.text}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontWeight: '700', color: st.state === 'todo' ? C.muted : C.fg }}>{i + 1}. {st.title}</Text>
                <Text style={s.ja}>{st.note}</Text>
                {mine && <TurnChip />}
              </View>
              <Text style={s.muted}>{st.people.map((p) => p.name).join('、') || '未指定'}</Text>
            </View>
            {on && <Text style={{ color: C.accent, fontWeight: '700', alignSelf: 'center' }}>表示中</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}
