'use client';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { createChoreAction, reorderChoresAction, updateChoreAction } from '@/lib/actions';
import { FREQUENCY_PERIOD_LABEL, type ChoreStatus, type FrequencyPeriod } from '@/lib/types';

/** 家事の項目の追加・名前や説明の変更・並び替え・非表示 (管理者のみ) */
export default function ChoreSettings({ chores }: { chores: ChoreStatus[] }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const addForm = useRef<HTMLFormElement>(null);

  const add = (fd: FormData) =>
    start(async () => {
      setErr(null);
      const r = await createChoreAction(fd);
      if (r.error) setErr(r.error);
      else addForm.current?.reset();
    });

  /** i 番目の家事を 1 つ上 (-1) / 下 (+1) に動かす */
  const move = (i: number, dir: -1 | 1) =>
    start(async () => {
      setErr(null);
      const ids = chores.map((c) => c.id);
      [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
      const r = await reorderChoresAction(ids);
      if (r.error) setErr(r.error);
    });

  return (
    <>
      {err && <div className="box-row"><div className="error" role="alert" style={{ margin: 0 }}>{err}</div></div>}
      {chores.map((c, i) => (
        <div key={c.id} className="box-row chore-setting-row">
          <div className="chore-order" role="group" aria-label={`${c.name}の並び順`}>
            <button type="button" className="btn-sm" disabled={pending || i === 0} onClick={() => move(i, -1)} aria-label={`${c.name}を上へ`} title="上へ">↑</button>
            <button type="button" className="btn-sm" disabled={pending || i === chores.length - 1} onClick={() => move(i, 1)} aria-label={`${c.name}を下へ`} title="下へ">↓</button>
          </div>
          <ChoreRow chore={c} onError={setErr} />
        </div>
      ))}
      <form ref={addForm} action={add} className="box-row actions">
        <input name="icon" placeholder="自動" title="空欄なら名前から選びます" aria-label="アイコン (絵文字。空欄なら名前から選びます)" style={{ width: 56, textAlign: 'center' }} maxLength={8} />
        <input name="name" placeholder="例: お風呂掃除" aria-label="家事の名前" required maxLength={30} style={{ flex: 1, minWidth: 160 }} />
        <button type="submit" disabled={pending}>追加</button>
        <input name="description" placeholder="説明 (任意) 例: 浴槽と床を洗って、排水口の髪の毛も取る" aria-label="家事の説明" maxLength={200} className="chore-desc-input" />
        <ScheduleInputs />
      </form>
    </>
  );
}

function ChoreRow({ chore, onError }: { chore: ChoreStatus; onError: (e: string | null) => void }) {
  const [name, setName] = useState(chore.name);
  const [icon, setIcon] = useState(chore.icon);
  const [description, setDescription] = useState(chore.description);
  const [duration, setDuration] = useState(chore.duration_minutes?.toString() ?? '');
  const [period, setPeriod] = useState<string>(chore.frequency_period ?? '');
  const [times, setTimes] = useState(chore.frequency_times?.toString() ?? '');
  const [pending, start] = useTransition();
  const dirty =
    name !== chore.name || icon !== chore.icon || description !== chore.description ||
    duration !== (chore.duration_minutes?.toString() ?? '') ||
    period !== (chore.frequency_period ?? '') ||
    times !== (chore.frequency_times?.toString() ?? '');

  const save = (archived: boolean) =>
    start(async () => {
      onError(null);
      const r = await updateChoreAction(chore.id, {
        name,
        icon,
        description,
        archived,
        duration_minutes: duration ? Number(duration) : null,
        frequency_period: period || null,
        frequency_times: times ? Number(times) : null,
      });
      if (r.error) onError(r.error);
    });

  return (
    <form
      className="actions"
      style={{ flex: 1, ...(chore.archived ? { opacity: 0.6 } : {}) }}
      onSubmit={(e) => {
        e.preventDefault();
        save(chore.archived);
      }}
    >
      <input value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="アイコン" style={{ width: 56, textAlign: 'center' }} maxLength={8} />
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="家事の名前" required maxLength={30} style={{ flex: 1, minWidth: 160 }} />
      {chore.archived && <span className="label label-muted">非表示</span>}
      <button type="submit" className="btn-sm" disabled={pending || !dirty}>保存</button>
      <button type="button" className="btn-sm" disabled={pending} onClick={() => save(!chore.archived)}>
        {chore.archived ? '再表示' : '非表示にする'}
      </button>
      <Link href={`/chores/${chore.id}`} className="btn btn-sm">📷 見本 ({chore.images.length})</Link>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="説明 (任意) どこまでやったらコミットしてよいかなど"
        aria-label="家事の説明"
        maxLength={200}
        className="chore-desc-input"
      />
      <ScheduleInputs
        duration={[duration, setDuration]}
        period={[period, setPeriod]}
        times={[times, setTimes]}
      />
    </form>
  );
}

type Field = [string, (v: string) => void];

/**
 * 所要時間 (分) と推奨頻度 (期間あたり何回) の入力。
 * 値と setter を渡すと制御コンポーネント (編集行)、渡さなければ name 付きのフォーム項目 (追加行) になる。
 */
function ScheduleInputs({ duration, period, times }: { duration?: Field; period?: Field; times?: Field }) {
  const bind = (f: Field | undefined, name: string) =>
    f ? { value: f[0], onChange: (e: { target: { value: string } }) => f[1](e.target.value) } : { name };
  return (
    <div className="chore-schedule-inputs">
      <label>
        <span className="muted small">⏱ 所要時間</span>
        <input type="number" min={1} max={1440} inputMode="numeric" placeholder="—" aria-label="所要時間 (分)" style={{ width: 80 }} {...bind(duration, 'duration_minutes')} />
        <span className="muted small">分</span>
      </label>
      <label>
        <span className="muted small">🔁 推奨頻度</span>
        <select aria-label="推奨頻度の期間" style={{ width: 'auto' }} {...bind(period, 'frequency_period')}>
          <option value="">未設定</option>
          {(Object.keys(FREQUENCY_PERIOD_LABEL) as FrequencyPeriod[]).map((p) => (
            <option key={p} value={p}>{FREQUENCY_PERIOD_LABEL[p]}</option>
          ))}
        </select>
        <input type="number" min={1} max={31} inputMode="numeric" placeholder="—" aria-label="推奨頻度の回数" style={{ width: 64 }} {...bind(times, 'frequency_times')} />
        <span className="muted small">回</span>
      </label>
    </div>
  );
}
