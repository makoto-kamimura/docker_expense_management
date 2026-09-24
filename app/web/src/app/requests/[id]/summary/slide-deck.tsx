'use client';
import { Children, useCallback, useEffect, useRef, useState } from 'react';
import { TimerBadge, TimerBar, TimerControls, usePresentTimer } from './present-timer';

/** 投影時のスライドの基準サイズ (この大きさで作って画面に合わせて拡大する) */
const SLIDE_W = 1280;
const SLIDE_H = 720;

/**
 * 子要素を 1 枚ずつのスライドとして表示する。
 * ←/→ キー・ボタン・目次で移動、「Show all」で全スライドを縦に並べる。印刷時は常に全スライドを 1 ページずつ出す。
 * 「投影」で全画面のプレゼンモードに入り、持ち時間 (基本 15 分) のタイマーを出す。
 */
export default function SlideDeck({ titles, children }: { titles: string[]; children: React.ReactNode }) {
  const slides = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [scale, setScale] = useState(1);
  const deckRef = useRef<HTMLDivElement>(null);
  const timer = usePresentTimer();
  const { start: startTimer, toggle: toggleTimer } = timer;
  const last = slides.length - 1;

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(last, i))), [last]);

  const startPresent = useCallback(() => {
    setShowAll(false);
    setPresenting(true);
    startTimer();
    // 全画面にできない環境 (iOS Safari など) でも、position: fixed のプレゼンモードだけは使える。
    const el = deckRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
  }, [startTimer]);

  const endPresent = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  // ブラウザ側 (Esc・F11 など) で全画面が解除されたらプレゼンモードも抜ける
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // 投影中はスライドを画面いっぱいに拡大する
  useEffect(() => {
    if (!presenting) return;
    const fit = () => setScale(Math.min(window.innerWidth / SLIDE_W, window.innerHeight / SLIDE_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [presenting]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !showAll)) {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(index - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(last);
      else if (e.key === 'f') (presenting ? endPresent : startPresent)();
      else if (e.key === 't') toggleTimer();
      else if (e.key === 'Escape' && presenting) endPresent();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [endPresent, go, index, last, presenting, showAll, startPresent, toggleTimer]);

  return (
    <div className={`deck${showAll ? ' deck-all' : ''}${presenting ? ' deck-present' : ''}`} ref={deckRef}>
      <div className="deck-toolbar no-print">
        <ol className="deck-toc" aria-label="スライド">
          {titles.map((t, i) => (
            <li key={t}>
              <button
                type="button"
                className={i === index && !showAll ? 'on' : ''}
                aria-current={i === index && !showAll ? 'step' : undefined}
                onClick={() => {
                  setShowAll(false);
                  go(i);
                }}
              >
                {i + 1}. {t}
              </button>
            </li>
          ))}
        </ol>
        <div className="deck-tools">
          <TimerControls t={timer} />
          <button type="button" className="btn-primary" onClick={startPresent}>投影 (F)</button>
          <button type="button" onClick={() => setShowAll((v) => !v)}>{showAll ? 'スライド表示' : '一覧表示'}</button>
          <button type="button" onClick={() => window.print()}>印刷 / PDF 保存</button>
        </div>
      </div>

      <div className="deck-frame" style={presenting ? { transform: `scale(${scale})` } : undefined}>
        {slides.map((slide, i) => (
          <section
            key={i}
            className="slide"
            aria-label={`${i + 1} / ${slides.length} ${titles[i] ?? ''}`}
            data-active={showAll || i === index ? 'true' : 'false'}
          >
            {slide}
            <footer className="slide-foot">
              <span>RingiWoMerge · {titles[i]}</span>
              <span>{i + 1} / {slides.length}</span>
            </footer>
          </section>
        ))}
      </div>

      {presenting && (
        <>
          <div className="present-hud">
            <TimerBadge t={timer} />
            <button type="button" onClick={timer.toggle}>{timer.running ? '一時停止' : '再開'}</button>
            <button type="button" onClick={() => timer.reset()}>リセット</button>
            <span className="present-page">{index + 1} / {slides.length}</span>
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="前のスライド">←</button>
            <button type="button" onClick={() => go(index + 1)} disabled={index === last} aria-label="次のスライド">→</button>
            <button type="button" onClick={endPresent}>終了 (Esc)</button>
          </div>
          <TimerBar t={timer} />
        </>
      )}

      {!showAll && !presenting && (
        <div className="deck-nav no-print">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0}>← 前へ</button>
          <span className="muted">{index + 1} / {slides.length} (← → キーでも移動できます)</span>
          <button type="button" className="btn-primary" onClick={() => go(index + 1)} disabled={index === last}>次へ →</button>
        </div>
      )}
    </div>
  );
}
