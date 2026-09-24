'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** 家族会議の基本の持ち時間 (分) */
export const DEFAULT_MINUTES = 15;
const PRESET_MINUTES = [5, 10, 15, 20, 30];
/** 残りがこれ以下になったら色を変える (秒) */
const WARN_SECONDS = 120;

export type PresentTimer = {
  /** 残り秒数。マイナスは超過 */
  left: number;
  /** 持ち時間 (秒) */
  total: number;
  running: boolean;
  tone: 'idle' | 'run' | 'warn' | 'over';
  /** m:ss (超過時は +m:ss) */
  text: string;
  start: () => void;
  toggle: () => void;
  reset: (minutes?: number) => void;
};

const fmt = (sec: number) => {
  const a = Math.abs(sec);
  return `${sec < 0 ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
};

/**
 * プレゼン用のカウントダウン。
 * 残りは終了時刻から都度計算するので、タブが裏に回ってもずれない。0 を過ぎたら超過時間を数える。
 */
export function usePresentTimer(minutes: number = DEFAULT_MINUTES): PresentTimer {
  const [total, setTotal] = useState(minutes * 60);
  const [left, setLeft] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);
  const leftRef = useRef(left);
  const totalRef = useRef(total);
  const runningRef = useRef(false);

  useEffect(() => {
    leftRef.current = left;
  }, [left]);

  useEffect(() => {
    if (!running) return;
    const tick = () => setLeft(Math.round((endAt.current - Date.now()) / 1000));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    endAt.current = Date.now() + leftRef.current * 1000;
    runningRef.current = true;
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
  }, []);

  const toggle = useCallback(() => (runningRef.current ? pause() : start()), [pause, start]);

  const reset = useCallback((m?: number) => {
    const secs = m != null ? m * 60 : totalRef.current;
    runningRef.current = false;
    totalRef.current = secs;
    leftRef.current = secs;
    setRunning(false);
    setTotal(secs);
    setLeft(secs);
  }, []);

  const tone = left < 0 ? 'over' : left <= WARN_SECONDS ? 'warn' : running ? 'run' : 'idle';
  return { left, total, running, tone, text: fmt(left), start, toggle, reset };
}

/** 残り時間の表示だけ (投影中の HUD / ツールバー共用) */
export function TimerBadge({ t }: { t: PresentTimer }) {
  return (
    <span className={`timer timer-${t.tone}`} role="timer" aria-label={t.left < 0 ? '超過時間' : '残り時間'}>
      <span className="timer-label">{t.left < 0 ? '超過' : '残り'}</span>
      <b>{t.text}</b>
    </span>
  );
}

/** 経過に合わせて伸びる帯 (投影中に画面下端へ) */
export function TimerBar({ t }: { t: PresentTimer }) {
  const pct = t.total > 0 ? Math.min(100, Math.max(0, ((t.total - t.left) / t.total) * 100)) : 0;
  return (
    <div className={`present-bar present-bar-${t.tone}`} aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TimerControls({ t }: { t: PresentTimer }) {
  return (
    <div className="timer-controls">
      <TimerBadge t={t} />
      <button type="button" onClick={t.toggle}>
        {t.running ? '一時停止' : t.left === t.total ? '開始' : '再開'}
      </button>
      <button type="button" onClick={() => t.reset()} disabled={!t.running && t.left === t.total}>
        リセット
      </button>
      <select
        aria-label="持ち時間"
        value={Math.round(t.total / 60)}
        onChange={(e) => t.reset(Number(e.target.value))}
      >
        {PRESET_MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}分
          </option>
        ))}
      </select>
    </div>
  );
}
