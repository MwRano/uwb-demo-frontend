// src/services/api.ts

export type BackendCoord = {
  x: number;
  y: number;
}

export async function fetchLatestLocation(): Promise<BackendCoord | null> {
  try {
    const res = await fetch('/api/latest_location');
    if (!res.ok) {
      throw new Error(`API Error: ${res.status}`);
    }
    const data = await res.json();
    
    // バックエンド側が {"estimated_coord": {"x": 2.5, "y": 4.1}} の形式で返すと想定
    if (data && data.estimated_coord) {
      return data.estimated_coord as BackendCoord;
    }
    // バックエンドが直接 {"x": 2.5, "y": 4.1} を返す場合は return data; とする
    return data; 
  } catch (err) {
    console.error('Failed to fetch location:', err);
    return null;
  }
}