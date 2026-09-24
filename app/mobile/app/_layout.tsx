import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#f6f8fa' }, headerTintColor: '#1f2328', headerShadowVisible: true }}>
        <Stack.Screen name="index" options={{ title: 'RingiWoMerge' }} />
        <Stack.Screen name="onboarding" options={{ title: 'ようこそ', headerBackVisible: false }} />
        <Stack.Screen name="requests/index" options={{ title: '購入稟議', headerBackVisible: false }} />
        <Stack.Screen name="requests/new" options={{ title: '新しいプロジェクト' }} />
        <Stack.Screen name="requests/[id]" options={{ title: '稟議' }} />
        <Stack.Screen name="requests/edit/[id]" options={{ title: '稟議の編集' }} />
        <Stack.Screen name="requests/purchase/[id]" options={{ title: '購入済みにする' }} />
        <Stack.Screen name="history/[id]" options={{ title: '変更履歴' }} />
        <Stack.Screen name="summary/[id]" options={{ title: 'まとめ資料' }} />
        <Stack.Screen name="dashboard" options={{ title: 'ダッシュボード' }} />
        <Stack.Screen name="chores/index" options={{ title: 'マイページ' }} />
        <Stack.Screen name="chores/[id]" options={{ title: 'きれいな状態の見本' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
