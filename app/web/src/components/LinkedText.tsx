import { splitUrls } from '@/lib/format';

/** 文章の中の URL をリンクにして表示する (コメントなど。リンクは新しいタブで開く) */
export default function LinkedText({ children }: { children: string }) {
  return (
    <>
      {splitUrls(children).map((p, i) =>
        p.url ? (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
