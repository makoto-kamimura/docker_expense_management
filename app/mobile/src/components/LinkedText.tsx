import { Linking, Text } from 'react-native';
import { splitUrls } from '@/format';
import { C } from './ui';

/** 文章の中の URL を押せるリンクにして表示する (コメントなど)。<Text> の中に置く */
export default function LinkedText({ children }: { children: string }) {
  return (
    <>
      {splitUrls(children).map((p, i) =>
        p.url ? (
          <Text key={i} style={{ color: C.accent }} onPress={() => Linking.openURL(p.url!)}>
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
