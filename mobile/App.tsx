import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CanvasScreen } from './src/screens/CanvasScreen';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CanvasScreen />
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}
