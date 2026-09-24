import { Alert, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { attachmentUrl, openAttachment, uploadAttachment } from '@/api';
import { isImage } from '@/format';
import type { Attachment } from '@/types';
import { C, s } from './ui';

/** 添付の一覧。画像はサムネイル、PDF 等はタップで OS のビューアで開く。 */
export function AttachmentList({ files, token, height = 72 }: { files: Attachment[]; token: string | null; height?: number }) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const open = (id: string) => openAttachment(id).catch((e) => Alert.alert('開けませんでした', (e as Error).message));
  return (
    <View style={{ gap: 8 }}>
      {files.map((f) => (
        <Pressable key={f.id} onPress={() => open(f.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLabel={`${f.file_name} を開く`}>
          {isImage(f.content_type) ? (
            <Image source={{ uri: attachmentUrl(f.id), headers }} style={{ width: height, height, borderRadius: 6, backgroundColor: C.bg }} resizeMode="cover" />
          ) : (
            <View style={{ width: height, height, borderRadius: 6, backgroundColor: '#ffebe9', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.red, fontWeight: '800' }}>{f.content_type === 'application/pdf' ? 'PDF' : 'ファイル'}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: C.accent }} numberOfLines={1}>{f.file_name}</Text>
            <Text style={s.muted}>{Math.max(1, Math.round(f.byte_size / 1024))} KB · タップで開く</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** カメラ / 写真 / ファイル (PDF) から選んでアップロードする。成功したら true。 */
export function pickAndUpload(requestId: string, kind: 'evidence' | 'receipt'): Promise<boolean> {
  return new Promise((resolve) => {
    const upload = async (file: { uri: string; name?: string | null; mimeType?: string | null } | null) => {
      if (!file) return resolve(false);
      try {
        await uploadAttachment(requestId, kind, file);
        resolve(true);
      } catch (e) {
        Alert.alert('アップロードに失敗しました', (e as Error).message);
        resolve(false);
      }
    };
    const fromImage = async (camera: boolean) => {
      const perm = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('権限が必要です');
        return resolve(false);
      }
      const r = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
      await upload(r.canceled ? null : { uri: r.assets[0].uri, name: r.assets[0].fileName, mimeType: r.assets[0].mimeType });
    };
    const fromFile = async () => {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      await upload(r.canceled ? null : { uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType });
    };
    Alert.alert(kind === 'receipt' ? 'レシートを添付' : '資料を添付', undefined, [
      { text: '写真を撮る', onPress: () => fromImage(true) },
      { text: '写真を選ぶ', onPress: () => fromImage(false) },
      { text: 'ファイルを選ぶ (PDF)', onPress: fromFile },
      { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
    ]);
  });
}
