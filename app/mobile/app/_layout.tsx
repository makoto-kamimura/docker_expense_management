import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#1f2937' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="index" options={{ title: 'ログイン' }} />
        <Stack.Screen name="expenses/index" options={{ title: '経費申請' }} />
        <Stack.Screen name="expenses/new" options={{ title: '新規申請' }} />
        <Stack.Screen name="expenses/[id]" options={{ title: '申請詳細' }} />
        <Stack.Screen name="expenses/edit/[id]" options={{ title: '編集' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
