import { NextRequest, NextResponse } from "next/server";

const GENAIPRO_KEY = process.env.GENAIPRO_API_KEY || "";
const BASE = "https://genaipro.vn/api/v1";

// ElevenLabs voices via GenAIPro — Russian native voices
const VOICE_MAP: Record<string, string> = {
  // Males
  "onyx":    "ogi2DyUAKJb7CEdqqvlU", // Stanislav - Deep, Empathetic and Warm
  "echo":    "XuEV9VY3VUASYgJVNBh0", // Sergey - Rich, Engaging and Captivating
  "fable":   "rQOBu7YxCDxGiFdTm28w", // Artem Lebedev - Captivating and Engaging
  "alloy":   "85bJFRap3VIXOThFHxk3", // Marko - Friendly and Warm
  "alan":    "zWSsRd3J6WyZFl12aGMB", // Alan - Soft, Hasty and Warm
  "roma":    "COh9ekOZfEEGwNC3GXnB", // Roma - Calm and Shy
  "mikhail": "ouyTiWqmHA5WI5bbX7zj", // Mikhail - Confident and Emotional
  // Females
  "nova":    "bi0tSQTrp58MDdPUkrEl", // Klava - Energetic, Engaging and Clear
  "shimmer": "7G0NvIkWRnU0Dqjgz13p", // Kate - Calm, Natural and Versatile
  "nataly":  "NhY0kyTmsKuEpHvDMngm", // Nataly - Youthful, Gentle and Soft
};

// Simple in-memory cache (task results)
const cache = new Map<string, { data: ArrayBuffer; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function cacheKey(text: string, voice: string) {
  return `${voice}:${text.slice(0, 100)}`;
}

async function createTask(text: string, voiceId: string): Promise<string> {
  const res = await fetch(`${BASE}/labs/task`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GENAIPRO_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      voice_id: voiceId,
      model_id: "eleven_flash_v2_5",
      speed: 1.0,
      stability: 0.5,
      similarity: 0.75,
      use_speaker_boost: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GenAIPro create task failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.task_id;
}

async function pollTask(taskId: string, maxWait = 30000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await fetch(`${BASE}/labs/task/${taskId}`, {
      headers: { Authorization: `Bearer ${GENAIPRO_KEY}` },
    });
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data = await res.json();
    if (data.status === "completed" && data.result) {
      return data.result; // MP3 URL
    }
    if (data.status === "failed") {
      throw new Error("TTS task failed");
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error("TTS timeout");
}

export async function POST(req: NextRequest) {
  try {
    const { text, voice } = await req.json();
    if (!text) {
      return NextResponse.json({ error: "no text" }, { status: 400 });
    }

    const voiceId = VOICE_MAP[voice] || VOICE_MAP["alloy"];
    const ck = cacheKey(text, voice);

    // Check cache
    const cached = cache.get(ck);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return new NextResponse(cached.data, {
        headers: { "Content-Type": "audio/mpeg" },
      });
    }

    // Create task
    const taskId = await createTask(text, voiceId);

    // Poll for result
    const mp3Url = await pollTask(taskId);

    // Download mp3
    const mp3Res = await fetch(mp3Url);
    if (!mp3Res.ok) throw new Error("Failed to download mp3");
    const audioData = await mp3Res.arrayBuffer();

    // Cache
    cache.set(ck, { data: audioData, ts: Date.now() });

    // Cleanup old cache entries
    if (cache.size > 50) {
      const now = Date.now();
      for (const [k, v] of cache) {
        if (now - v.ts > CACHE_TTL) cache.delete(k);
      }
    }

    return new NextResponse(audioData, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (e: unknown) {
    console.error("TTS error:", e);
    return NextResponse.json(
      { error: (e as Error).message || "TTS failed" },
      { status: 500 }
    );
  }
}
