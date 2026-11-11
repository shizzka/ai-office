"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// GenAIPro/ElevenLabs Russian voices
const AGENT_VOICES: Record<string, string> = {
  "Ванечка": "alloy",
  "Ваня": "alloy",
  "Тёма": "echo",
  "Пушкин": "fable",
  "Володя": "onyx",
  "Гарик": "mikhail",
  "Стоянов": "alan",
  "Дед": "roma",
  "Леночка": "nova",
  "Прошка": "echo",
  "Гари": "mikhail",
};

const AGENT_NAMES: Record<string, string> = {
  vanya: "Ванечка", designer: "Тёма", tema: "Тёма",
  copywriter: "Пушкин", pushkin: "Пушкин",
  tech: "Володя", volodya: "Володя",
  garik: "Гарик", stoyanov: "Стоянов",
  ded: "Дед", lenochka: "Леночка",
  proshka: "Прошка", gary: "Гари",
};

interface FeedItem {
  id: string; entityType: string; entityId: string;
  action: string; details: string | null; createdAt: string;
}

interface Announcement {
  id: string; text: string; agentName: string; time: string; playing?: boolean;
}

interface VoiceManifest {
  [agentKey: string]: {
    name: string;
    voiceKey: string;
    clips: { [phrase: string]: string };
  };
}

function getAgentName(item: FeedItem): string {
  return AGENT_NAMES[item.entityId] || AGENT_NAMES[item.entityType] || item.entityId || "Агент";
}

function getAgentKey(agentName: string): string {
  const map: Record<string, string> = {
    "Ванечка": "vanya", "Тёма": "tema", "Пушкин": "pushkin",
    "Володя": "volodya", "Гарик": "garik", "Стоянов": "stoyanov",
    "Дед": "ded", "Леночка": "lenochka", "Прошка": "proshka", "Гари": "gary",
  };
  return map[agentName] || "vanya";
}

function extractPhrase(item: FeedItem, agentName: string): string | null {
  const details = item.details || "";
  try {
    const parsed = JSON.parse(details);
    if (parsed.message) {
      let msg = parsed.message;
      const colonIdx = msg.indexOf(": ");
      if (colonIdx > 0 && colonIdx < 20) msg = msg.slice(colonIdx + 2);
      msg = msg.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]/gu, "").trim();
      if (msg.length > 3) return `${agentName}. ${msg}`;
    }
  } catch {}
  if (details.length > 5) return `${agentName}: ${details.slice(0, 80)}`;
  return null;
}

// Find best matching pre-generated clip
function findClip(manifest: VoiceManifest | null, agentKey: string, text: string): string | null {
  if (!manifest || !manifest[agentKey]) return null;
  const clips = manifest[agentKey].clips;
  // Exact match
  for (const [phrase, path] of Object.entries(clips)) {
    if (text.includes(phrase)) return path;
  }
  // Random clip for this agent (fallback)
  const paths = Object.values(clips);
  if (paths.length > 0) return paths[Math.floor(Math.random() * paths.length)];
  return null;
}

export default function StreamVoicePage() {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<VoiceManifest | null>(null);
  const [clipCount, setClipCount] = useState(0);

  const lastSeenIdRef = useRef<string | null>(null);
  const queueRef = useRef<Announcement[]>([]);
  const playingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load manifest
  useEffect(() => {
    fetch("/voices/manifest.json")
      .then(r => r.json())
      .then(m => {
        setManifest(m);
        let count = 0;
        for (const a of Object.values(m)) count += Object.keys((a as { clips: Record<string, string> }).clips).length;
        setClipCount(count);
      })
      .catch(() => setManifest(null));
  }, []);

  const enableAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    // Warm up audio on iOS
    audioRef.current.src = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwMHAAAAAAD/+1DEAAAH+ANoAAAA";
    audioRef.current.volume = 0.01;
    audioRef.current.play().catch(() => {});
    setAudioEnabled(true);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // Play a pre-generated clip or fallback to API
  const speak = useCallback(async (text: string, agentName: string): Promise<void> => {
    const agentKey = getAgentKey(agentName);
    const clipPath = findClip(manifest, agentKey, text);

    let audioSrc: string;

    if (clipPath) {
      // Pre-generated — instant!
      audioSrc = clipPath;
    } else {
      // Fallback to API (slow)
      const voice = AGENT_VOICES[agentName] || "alloy";
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice }),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        audioSrc = URL.createObjectURL(blob);
      } catch { return; }
    }

    const audio = audioRef.current || new Audio();
    audio.volume = muted ? 0 : volume;
    audio.src = audioSrc;

    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }, [manifest, volume, muted]);

  // Process queue
  const processQueue = useCallback(async () => {
    if (playingRef.current) return;
    if (queueRef.current.length === 0) return;
    playingRef.current = true;
    setIsPlaying(true);

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;
      setAnnouncements(prev => prev.map(a => ({ ...a, playing: a.id === item.id })));
      await speak(item.text, item.agentName);
      setAnnouncements(prev => prev.map(a => ({ ...a, playing: false })));
      await new Promise(r => setTimeout(r, 300));
    }

    playingRef.current = false;
    setIsPlaying(false);
  }, [speak]);

  // Poll activity feed
  useEffect(() => {
    if (!audioEnabled) return;
    const poll = async () => {
      try {
        const res = await fetch("/api/activity/feed");
        if (!res.ok) { setConnected(false); return; }
        setConnected(true); setError(null);
        const data = await res.json();
        const feed: FeedItem[] = data.feed || [];
        if (feed.length === 0) return;
        if (!lastSeenIdRef.current) { lastSeenIdRef.current = feed[0]?.id || null; return; }
        const newItems: FeedItem[] = [];
        for (const item of feed) {
          if (item.id === lastSeenIdRef.current) break;
          newItems.push(item);
        }
        if (newItems.length > 0) {
          lastSeenIdRef.current = newItems[0].id;
          for (const item of newItems.reverse()) {
            const agentName = getAgentName(item);
            const phrase = extractPhrase(item, agentName);
            if (!phrase) continue;
            const announcement: Announcement = {
              id: item.id, text: phrase, agentName,
              time: new Date(item.createdAt).toLocaleTimeString("ru-RU"),
            };
            setAnnouncements(prev => [announcement, ...prev].slice(0, 50));
            queueRef.current.push(announcement);
          }
          processQueue();
        }
      } catch { setConnected(false); setError("Ошибка подключения"); }
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => clearInterval(interval);
  }, [audioEnabled, processQueue]);

  // Test
  const testVoice = useCallback(() => {
    const agents = ["Ванечка", "Пушкин", "Володя", "Тёма", "Дед", "Леночка", "Гарик", "Гари"];
    const agent = agents[Math.floor(Math.random() * agents.length)];
    const agentKey = getAgentKey(agent);
    
    // Pick random pre-generated phrase if available
    let text = `${agent}. Тестирую голос`;
    if (manifest?.[agentKey]) {
      const phrases = Object.keys(manifest[agentKey].clips);
      if (phrases.length > 0) {
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        text = `${agent}. ${phrase}`;
      }
    }

    const a: Announcement = {
      id: `test-${Date.now()}`, text, agentName: agent,
      time: new Date().toLocaleTimeString("ru-RU"),
    };
    setAnnouncements(prev => [a, ...prev].slice(0, 50));
    queueRef.current.push(a);
    processQueue();
  }, [processQueue, manifest]);

  return (
    <div style={{ minHeight: "100vh", background: "#1a1a2e", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#fff", margin: 0 }}>🎙️ AI Office Voice Monitor</h1>
          <div style={{ marginTop: 8, fontSize: 14, color: connected ? "#4ade80" : "#f87171", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#4ade80" : "#f87171", display: "inline-block", animation: isPlaying ? "pulse 1s infinite" : undefined }} />
            {!audioEnabled ? "Нажмите кнопку для включения" : isPlaying ? "🔊 Озвучка..." : connected ? "Слушаю активность" : "Переподключение..."}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#555" }}>
            ElevenLabs · {clipCount} готовых клипов · мгновенное воспроизведение
          </div>
        </div>

        {!audioEnabled && (
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <button onClick={enableAudio} style={{ background: "linear-gradient(135deg, #f0c040, #e6a010)", color: "#1a1a2e", border: "none", borderRadius: 12, padding: "16px 48px", fontSize: 18, fontWeight: 700, cursor: "pointer" }}>
              🔊 Включить озвучку
            </button>
            <p style={{ marginTop: 12, fontSize: 13, color: "#888" }}>
              {clipCount > 0 ? `${clipCount} клипов готово` : "Загрузка..."}
            </p>
          </div>
        )}

        {audioEnabled && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, padding: "12px 16px", background: "#16213e", borderRadius: 10 }}>
            <button onClick={() => setMuted(!muted)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", padding: 4 }}>
              {muted ? "🔇" : "🔊"}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={e => setVolume(parseFloat(e.target.value))} style={{ flex: 1, accentColor: "#f0c040" }} />
            <span style={{ fontSize: 13, color: "#888", minWidth: 36 }}>{Math.round(volume * 100)}%</span>
            <button onClick={testVoice} style={{ background: "#f0c040", color: "#1a1a2e", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              🎤 Тест
            </button>
          </div>
        )}

        {error && <div style={{ padding: "10px 16px", background: "#3b1111", borderRadius: 8, marginBottom: 16, color: "#f87171", fontSize: 14 }}>{error}</div>}

        <div>
          {announcements.length === 0 && audioEnabled && (
            <div style={{ textAlign: "center", padding: 40, color: "#555" }}>
              Ожидание активности агентов...<br/>
              <span style={{ fontSize: 13 }}>Нажми «Тест» чтобы услышать голос</span>
            </div>
          )}
          {announcements.map(a => (
            <div key={a.id} style={{ padding: "12px 16px", background: a.playing ? "#1e2a4a" : "#16213e", borderRadius: 8, marginBottom: 8, borderLeft: a.playing ? "3px solid #f0c040" : "3px solid transparent", transition: "all 0.3s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: "#f0c040" }}>{a.agentName}</span>
                <span style={{ fontSize: 12, color: "#555" }}>{a.time}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 14, color: "#ccc" }}>
                {a.playing && <span style={{ marginRight: 8 }}>🔉</span>}{a.text}
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }`}</style>
    </div>
  );
}
