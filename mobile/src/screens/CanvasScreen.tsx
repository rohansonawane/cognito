import React, { useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Canvas, Path, Skia, useDrawRef } from "@shopify/react-native-skia";
import { PanGestureHandler, PanGestureHandlerStateChangeEvent, State } from "react-native-gesture-handler";
import { SERVER_URL } from "../config";

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; size: number };

const COLORS = ["#1e40af", "#ef4444", "#10b981", "#f59e0b", "#6b7280", "#111827", "#ffffff"];

export function CanvasScreen(): JSX.Element {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [brushColor, setBrushColor] = useState<string>(COLORS[0]);
  const [brushSize, setBrushSize] = useState<number>(6);
  const [loading, setLoading] = useState<boolean>(false);
  const drawRef = useDrawRef();
  const containerRef = useRef<View>(null);

  const currentPath = useMemo(() => createPathFromPoints(currentPoints), [currentPoints]);

  const onHandlerStateChange = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.BEGAN) {
      const { x, y } = e.nativeEvent;
      setCurrentPoints([{ x, y }]);
    }
    if (e.nativeEvent.state === State.ACTIVE) {
      const { x, y } = e.nativeEvent;
      setCurrentPoints((pts) => [...pts, { x, y }]);
    }
    if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED || e.nativeEvent.state === State.FAILED) {
      if (currentPoints.length > 0) {
        setStrokes((s) => [...s, { points: currentPoints, color: brushColor, size: brushSize }]);
      }
      setCurrentPoints([]);
    }
  };

  const clearCanvas = () => {
    setStrokes([]);
    setCurrentPoints([]);
  };

  const askAI = async () => {
    try {
      if (!SERVER_URL) {
        Alert.alert("Missing SERVER_URL", "Please set SERVER_URL in app.config.ts or as env.");
        return;
      }
      setLoading(true);
      // Snapshot Skia canvas to base64 PNG
      const image = drawRef.current?.makeImageSnapshot?.();
      const base64 = image?.encodeToBase64?.();
      if (!base64) {
        Alert.alert("Capture failed", "Could not capture the canvas image.");
        setLoading(false);
        return;
      }
      const res = await fetch(`${SERVER_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: `data:image/png;base64,${base64}` }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      Alert.alert("AI Response", typeof data === "string" ? data : data.response || "Done");
    } catch (err: any) {
      Alert.alert("AI Error", err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }} ref={containerRef}>
      {/* Top toolbar */}
      <View style={{ paddingTop: 44, paddingHorizontal: 12, paddingBottom: 8, backgroundColor: "#0b1220", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: "#e5e7eb", fontSize: 18, fontWeight: "600" }}>Cognito Mobile</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={() => setBrushSize(Math.max(1, brushSize - 1))} style={btn()}>
            <Text style={btnText()}>-</Text>
          </TouchableOpacity>
          <Text style={{ color: "#cbd5e1", paddingHorizontal: 4, alignSelf: "center" }}>{brushSize}</Text>
          <TouchableOpacity onPress={() => setBrushSize(Math.min(48, brushSize + 1))} style={btn()}>
            <Text style={btnText()}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearCanvas} style={btn()}>
            <Text style={btnText()}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={askAI} disabled={loading} style={[btn(), { backgroundColor: loading ? "#334155" : "#2563eb" }]}>
            {loading ? <ActivityIndicator color="#e2e8f0" /> : <Text style={{ color: "#e2e8f0", fontWeight: "700" }}>Ask AI</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Color palette */}
      <View style={{ flexDirection: "row", padding: 12, gap: 10, backgroundColor: "#0b1220" }}>
        {COLORS.map((c) => (
          <TouchableOpacity key={c} onPress={() => setBrushColor(c)} style={{ width: 28, height: 28, borderRadius: 9999, backgroundColor: c, borderWidth: brushColor === c ? 2 : 0, borderColor: "#e2e8f0" }} />
        ))}
      </View>

      {/* Canvas area */}
      <PanGestureHandler onHandlerStateChange={onHandlerStateChange} onGestureEvent={onHandlerStateChange}>
        <View style={{ flex: 1 }}>
          <Canvas ref={drawRef} style={{ flex: 1, backgroundColor: "#0f172a" }}>
            {strokes.map((s, idx) => (
              <Path key={idx} path={createPathFromPoints(s.points)} color={s.color} style="stroke" strokeWidth={s.size} strokeJoin="round" strokeCap="round" />
            ))}
            {currentPoints.length > 0 && (
              <Path path={currentPath} color={brushColor} style="stroke" strokeWidth={brushSize} strokeJoin="round" strokeCap="round" />
            )}
          </Canvas>
        </View>
      </PanGestureHandler>
    </View>
  );
}

function createPathFromPoints(points: Point[]) {
  const p = Skia.Path.Make();
  if (points.length === 0) return p;
  p.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    p.lineTo(pt.x, pt.y);
  }
  return p;
}

function btn() {
  return {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#1f2937",
    borderRadius: 10,
    marginLeft: 8,
  } as const;
}

function btnText() {
  return { color: "#e2e8f0", fontWeight: "700" } as const;
}


