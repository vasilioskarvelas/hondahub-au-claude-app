import React from "react";
import { motion } from "framer-motion";
import { Play, RotateCcw, Trophy, Gift, Gauge, Zap } from "lucide-react";
import { getCurrentUser, setCurrentUser } from "@/lib/userIdentity";

const MIN_PRESSURE = 0;
const MAX_PRESSURE = 30;
const GREEN_MIN = 12;
const GREEN_MAX = 20;
const RED_LINE = 24;
const TARGET_TIME = 15;
const TIME_LIMIT = 40;
const TICK_MS = 50;
const HOLD_RATE = 28;
const DECAY_RATE = 22;

export default function BoostControllerGame({ onWin, onLose }) {
  const [phase, setPhase] = React.useState("intro");
  const [pressure, setPressure] = React.useState(0);
  const [greenTime, setGreenTime] = React.useState(0);
  const [timeLeft, setTimeLeft] = React.useState(TIME_LIMIT);
  const [name, setName] = React.useState(getCurrentUser() || "");
  const holdingRef = React.useRef(false);
  const endedRef = React.useRef(false);
  const rafRef = React.useRef(null);
  const lastTickRef = React.useRef(0);

  const startGame = () => {
    if (name) setCurrentUser(name);
    endedRef.current = false;
    setPressure(0);
    setGreenTime(0);
    setTimeLeft(TIME_LIMIT);
    holdingRef.current = false;
    setPhase("playing");
  };

  React.useEffect(() => {
    if (phase !== "playing") return;

    lastTickRef.current = performance.now();
    let secondAccumulator = 0;

    const loop = (now) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      setPressure((prev) => {
        let next;
        if (holdingRef.current) {
          next = prev + HOLD_RATE * dt;
        } else {
          next = prev - DECAY_RATE * dt;
        }
        return Math.max(MIN_PRESSURE, Math.min(MAX_PRESSURE, next));
      });

      setGreenTime((prev) => {
        return prev;
      });

      secondAccumulator += dt;
      if (secondAccumulator >= 1) {
        secondAccumulator -= 1;
        setTimeLeft((prev) => {
          const tl = prev - 1;
          if (tl <= 0) {
            return 0;
          }
          return tl;
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  React.useEffect(() => {
    if (phase !== "playing") return;

    const interval = setInterval(() => {
      if (endedRef.current) return;

      setPressure((currentPressure) => {
        if (currentPressure >= GREEN_MIN && currentPressure <= GREEN_MAX) {
          setGreenTime((prev) => {
            const newGreen = prev + TICK_MS / 1000;
            if (newGreen >= TARGET_TIME) {
              endGame(true);
            }
            return newGreen;
          });
        }

        if (currentPressure >= RED_LINE) {
          endGame(false);
        }
        return currentPressure;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [phase]);

  React.useEffect(() => {
    if (phase === "playing" && timeLeft <= 0) {
      endGame(false);
    }
  }, [timeLeft, phase]);

  const endGame = (won) => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase("result");
    const score = Math.floor(greenTime);
    if (won && onWin) onWin(score, TARGET_TIME);
    else if (!won && onLose) onLose(score, TARGET_TIME);
  };

  const handlePress = () => {
    holdingRef.current = true;
  };
  const handleRelease = () => {
    holdingRef.current = false;
  };

  const needleAngle = -120 + (pressure / MAX_PRESSURE) * 240;
  const inGreen = pressure >= GREEN_MIN && pressure <= GREEN_MAX;
  const inRed = pressure >= RED_LINE;

  if (phase === "intro") {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <Gauge className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mt-4 text-2xl font-black">Boost Controller</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Hold to spool the turbo, release to let off. Keep boost in the green zone for {TARGET_TIME}s total to earn a <span className="font-bold text-primary">free giveaway entry</span>!
        </p>
        <div className="mx-auto mt-5 max-w-xs space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-left text-xs text-muted-foreground">
            <Zap className="h-4 w-4 shrink-0 text-primary" /> Hold to build boost, release to vent
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-left text-xs text-muted-foreground">
            <Trophy className="h-4 w-4 shrink-0 text-primary" /> {TIME_LIMIT}s to accumulate {TARGET_TIME}s in the green
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-left text-xs text-muted-foreground">
            <span className="text-destructive">⚠</span> Hit the redline and your engine blows!
          </div>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          className="mt-5 w-full max-w-xs rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={startGame}
          disabled={!name.trim()}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition active:scale-95 disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> Start Boosting
        </button>
      </div>
    );
  }

  if (phase === "result") {
    const won = greenTime >= TARGET_TIME;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-border bg-card p-8 text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${won ? "bg-primary/15" : "bg-secondary"}`}>
          {won ? <Trophy className="h-8 w-8 text-primary" /> : <RotateCcw className="h-8 w-8 text-muted-foreground" />}
        </div>
        <h2 className="mt-4 text-2xl font-black">{won ? "Boost Held! 🎉" : inRed ? "Boom! 💥" : "Time's Up!"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You held boost for <span className="font-black text-primary">{Math.floor(greenTime)}s</span> out of <span className="font-black">{TARGET_TIME}s</span> target
        </p>
        {won ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary/15 px-4 py-2 text-sm font-bold text-primary">
            <Gift className="h-4 w-4" /> +1 Free Giveaway Entry!
          </div>
        ) : (
          <p className="mx-auto mt-4 max-w-xs text-xs text-muted-foreground">
            {inRed ? "You over-boosted and blew the engine!" : `Hold boost in the green zone for ${TARGET_TIME}s to win.`}
          </p>
        )}
        <button onClick={startGame} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition active:scale-95">
          <RotateCcw className="h-4 w-4" /> Try Again
        </button>
      </motion.div>
    );
  }

  const greenPct = Math.min(100, (greenTime / TARGET_TIME) * 100);

  return (
    <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-bold ${inGreen ? "text-primary" : "text-muted-foreground"}`}>
          {inGreen ? "✓ IN THE ZONE" : "BOOST"}
        </span>
        <span className={`font-bold ${timeLeft <= 10 ? "text-destructive" : "text-muted-foreground"}`}>{timeLeft}s left</span>
      </div>

      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full transition-all ${inGreen ? "bg-primary" : "bg-muted-foreground"}`} style={{ width: `${greenPct}%` }} />
      </div>
      <p className="mt-1 text-center text-xs text-muted-foreground">{Math.floor(greenTime)}s / {TARGET_TIME}s in green zone</p>

      {/* Boost gauge */}
      <div className="relative mx-auto mt-6 flex h-48 w-48 items-end justify-center sm:h-56 sm:w-56">
        <svg viewBox="0 0 200 120" className="w-full">
          {/* Arc background */}
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="hsl(var(--secondary))" strokeWidth="14" strokeLinecap="round" />
          {/* Red zone */}
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="hsl(var(--secondary))" strokeWidth="14" strokeLinecap="round" />
          {/* Green zone arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${((GREEN_MAX - GREEN_MIN) / MAX_PRESSURE) * 251} 251`}
            strokeDashoffset={`${-((GREEN_MIN / MAX_PRESSURE) * 251)}`}
          />
          {/* Tick marks */}
          {Array.from({ length: 7 }).map((_, i) => {
            const angle = -120 + (i / 6) * 240;
            const rad = (angle * Math.PI) / 180;
            const x1 = 100 + Math.cos(rad) * 62;
            const y1 = 100 + Math.sin(rad) * 62;
            const x2 = 100 + Math.cos(rad) * 72;
            const y2 = 100 + Math.sin(rad) * 72;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />;
          })}
          {/* Needle */}
          <g style={{ transform: `rotate(${needleAngle}deg)`, transformOrigin: "100px 100px", transition: "transform 0.05s linear" }}>
            <line x1="100" y1="100" x2="100" y2="32" stroke={inRed ? "hsl(var(--destructive))" : inGreen ? "hsl(var(--primary))" : "hsl(var(--foreground))"} strokeWidth="3" strokeLinecap="round" />
          </g>
          {/* Center hub */}
          <circle cx="100" cy="100" r="8" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="2" />
        </svg>
        <div className="absolute bottom-0 text-center">
          <div className={`text-3xl font-black tabular-nums ${inRed ? "text-destructive" : inGreen ? "text-primary" : "text-foreground"}`}>
            {pressure.toFixed(1)}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">PSI</div>
        </div>
      </div>

      {/* Hold button */}
      <button
        onPointerDown={(e) => { e.preventDefault(); handlePress(); }}
        onPointerUp={handleRelease}
        onPointerLeave={handleRelease}
        onPointerCancel={handleRelease}
        onContextMenu={(e) => e.preventDefault()}
        className={`mt-4 w-full select-none rounded-2xl py-6 text-sm font-black uppercase tracking-wider transition-all active:scale-[0.98] ${
          inRed
            ? "bg-destructive text-destructive-foreground"
            : inGreen
            ? "bg-primary text-primary-foreground glow-red"
            : "bg-secondary text-foreground hover:bg-secondary/80"
        }`}
      >
        {holdingRef.current ? "BOOSTING ⬆" : "HOLD TO BOOST"}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">Hold and release to keep the needle in the green zone</p>
    </div>
  );
}