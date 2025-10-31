import React, { useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, Dimensions, Alert } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';

type Point = { x: number; y: number };
type Stroke = { color: string; size: number; brush: 'brush'|'marker'|'highlighter'|'eraser'; points: Point[] };

export default function App() {
  const [brush, setBrush] = useState<'brush'|'marker'|'highlighter'|'eraser'>('brush');
  const [size, setSize] = useState(8);
  const [color, setColor] = useState('#FFFFFF');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Point[]>([]);
  const [aiText, setAiText] = useState('Draw, then Ask AI');
  const [provider, setProvider] = useState<'openai'|'gemini'>('openai');
  const viewRef = useRef<View>(null);

  const colors = useMemo(() => ['#FFFFFF','#000000','#00F0C8','#00C2A8','#FF6B6B','#FFD166','#06D6A0','#118AB2'], []);
  const { width } = Dimensions.get('window');
  const height = Math.max(360, Math.round(width * 0.75));

  function pathFrom(points: Point[]) {
    if (!points.length) return '';
    const d = [`M ${points[0].x} ${points[0].y}`];
    for (let i = 1; i < points.length; i++) d.push(`L ${points[i].x} ${points[i].y}`);
    return d.join(' ');
  }

  function onStart(e: any) {
    const { locationX: x, locationY: y } = e.nativeEvent;
    setCurrent([{ x, y }]);
  }

  function onMove(e: any) {
    if (!current.length) return;
    const { locationX: x, locationY: y } = e.nativeEvent;
    setCurrent(prev => [...prev, { x, y }]);
  }

  function onEnd() {
    if (!current.length) return;
    setStrokes(prev => [...prev, { color: brush==='eraser' ? '#111111' : color, size, brush, points: current }]);
    setCurrent([]);
  }

  function clear() {
    setStrokes([]);
  }

  async function onAnalyze() {
    try {
      if (!viewRef.current) return;
      setAiText('Analyzing...');
      const uri = await captureRef(viewRef, { format: 'png', quality: 1, result: 'base64' });
      const image = `data:image/png;base64,${uri}`;
      const resp = await fetch('http://127.0.0.1:8787/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, provider })
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.error || 'AI failed');
      setAiText(json.message || 'Done');
    } catch (e: any) {
      Alert.alert('AI Error', String(e?.message || e));
      setAiText('Error');
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Canvas (Native)</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.btnAccent]} onPress={onAnalyze}><Text style={styles.btnText}>Ask AI</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={clear}><Text style={styles.btnText}>Clear</Text></TouchableOpacity>
        </View>
      </View>

      <ViewShot ref={viewRef} style={[styles.canvasWrap, { width, height }] }>
        <Svg width={width} height={height}>
          {strokes.map((s, i) => (
            <Path key={i} d={pathFrom(s.points)} stroke={s.color} strokeWidth={s.size} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {current.length ? (
            <Path d={pathFrom(current)} stroke={brush==='eraser' ? '#111111' : color} strokeWidth={size} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
        </Svg>
        <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderGrant={onStart} onResponderMove={onMove} onResponderRelease={onEnd} />
      </ViewShot>

      <View style={styles.toolbar}>
        <View style={styles.row}>
          {(['brush','marker','highlighter','eraser'] as const).map(b => (
            <TouchableOpacity key={b} style={[styles.btn, brush===b && styles.btnPrimary]} onPress={() => setBrush(b)}><Text style={styles.btnText}>{b}</Text></TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          {colors.map(c => (
            <TouchableOpacity key={c} style={[styles.swatch, { backgroundColor: c }]} onPress={() => setColor(c)} />
          ))}
        </View>
      </View>

      <View style={styles.footer}><Text style={styles.subtitle}>{aiText}</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1E1E1E' },
  header: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  title: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  btn: { backgroundColor: '#2A2A2A', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  btnText: { color: '#FFF' },
  btnPrimary: { backgroundColor: '#00F0C8' },
  btnAccent: { borderColor: '#00C2A8' },
  canvasWrap: { backgroundColor: '#111111', borderRadius: 16, borderWidth: 1, borderColor: '#333', margin: 12, overflow: 'hidden' },
  toolbar: { paddingHorizontal: 12 },
  swatch: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginRight: 6, marginBottom: 6 },
  footer: { padding: 12 },
  subtitle: { color: '#B0B0B0' }
});


