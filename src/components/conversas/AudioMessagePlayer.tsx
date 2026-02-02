import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function computePeaks(url: string, bars: number) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const channel = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(channel.length / bars));
    const peaks = new Array(bars).fill(0).map((_, i) => {
      const start = i * step;
      const end = Math.min(channel.length, start + step);
      let sum = 0;
      for (let j = start; j < end; j += 1) {
        const v = channel[j];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / Math.max(1, end - start));
      return Math.min(1, Math.max(0, rms));
    });
    const max = Math.max(...peaks, 0.0001);
    return peaks.map((p) => p / max);
  } finally {
    try { await ctx.close(); } catch {}
  }
}

export function AudioMessagePlayer(props: { url: string; className?: string }) {
  const { url, className } = props;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rateIndex, setRateIndex] = useState(0);
  const rates = useMemo(() => [1, 1.5, 2], []);
  const rate = rates[rateIndex] ?? 1;
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    let alive = true;
    setPeaks(null);
    void computePeaks(url, 48)
      .then((p) => {
        if (!alive) return;
        setPeaks(p);
      })
      .catch(() => {
        if (!alive) return;
        setPeaks(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onLoaded = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onTime = () => setCurrentTime(el.currentTime || 0);
    const onEnded = () => setIsPlaying(false);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);

    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
    };
  }, [url]);

  async function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      try { await el.play(); } catch {}
    } else {
      el.pause();
    }
  }

  function onSeek(values: number[]) {
    const el = audioRef.current;
    if (!el) return;
    const v = values[0] ?? 0;
    el.currentTime = (v / 100) * (duration || 0);
    setCurrentTime(el.currentTime || 0);
  }

  function cycleRate() {
    setRateIndex((i) => (i + 1) % rates.length);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn("w-[320px] max-w-full", className)}>
      <audio ref={audioRef} src={url} preload="metadata" />
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="icon" onClick={() => void togglePlay()}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <div className="min-w-0 flex-1">
          {peaks ? (
            <div className="flex h-9 items-end gap-[2px]">
              {peaks.map((p, idx) => {
                const h = Math.max(3, Math.round(p * 28));
                const active = duration > 0 ? (idx / peaks.length) * 100 <= progress : false;
                return (
                  <div
                    key={idx}
                    className={cn("w-[3px] rounded-sm", active ? "bg-primary" : "bg-primary/30")}
                    style={{ height: `${h}px` }}
                  />
                );
              })}
            </div>
          ) : (
            <Slider value={[progress]} max={100} step={0.1} onValueChange={onSeek} />
          )}

          <Slider className="mt-2" value={[progress]} max={100} step={0.1} onValueChange={onSeek} />
        </div>

        <Button type="button" variant="outline" size="sm" onClick={cycleRate} className="shrink-0">
          {rate}x
        </Button>
      </div>

      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{formatTime(currentTime)}</span>
        <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          baixar
        </a>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

