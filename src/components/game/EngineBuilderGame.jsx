import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, RotateCcw, Trophy, Gift, Wrench, Heart, Check, X } from "lucide-react";
import { getCurrentUser, setCurrentUser } from "@/lib/userIdentity";

const BUILD_ORDER = [
  { emoji: "🧱", name: "Engine Block", step: "Lower block foundation" },
  { emoji: "🔄", name: "Crankshaft", step: "Rotating assembly base" },
  { emoji: "🔩", name: "Pistons & Rods", step: "Connecting rods to crank" },
  { emoji: "🔝", name: "Cylinder Head", step: "Seal the top end" },
  { emoji: "⚙️", name: "Camshafts", step: "Valve timing control" },
  { emoji: "🔧", name: "Valves & Springs", step: "Intake & exhaust flow" },
  { emoji: "🌬️", name: "Intake Manifold", step: "Air delivery system" },
  { emoji: "💨", name: "Exhaust Manifold", step: "Gas exit & turbo" },
];

const TOTAL = BUILD_ORDER.length;
const MAX_LIVES = 3;
const TIME_LIMIT = 90;

function shuffleOptions(correctIndex) {
  const pool = BUILD_ORDER.filter((_, i) => i !== correctIndex);
  const distractors = [];
  while (distractors.length < 3) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!distractors.includes(pick)) distractors.push(pick);
  }
  const options = [...distractors, BUILD_ORDER[correctIndex]];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

export default function EngineBuilderGame({ onWin, onLose }) {
  const [phase, setPhase] = React.useState("intro");
  const [currentStep, setCurrentStep] = React.useState(0);
  const [options, setOptions] = React.useState([]);
  const [lives, setLives] = React.useState(MAX_LIVES);
  const [timeLeft, setTimeLeft] = React.useState(TIME_LIMIT);
  const [picked, setPicked] = React.useState(null);
  const [name, setName] = React.useState(getCurrentUser() || "");
  const endedRef = React.useRef(false);

  React.useEffect(() => {
    if (phase !== "playing") return;
    if (timeLeft <= 0) {
      endGame(false);
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft]);

  React.useEffect(() => {
    if (phase === "playing") {
      setOptions(shuffleOptions(currentStep));
    }
  }, [currentStep, phase]);

  const startGame = () => {
    if (name) setCurrentUser(name);
    endedRef.current = false;
    setCurrentStep(0);
    setLives(MAX_LIVES);
    setTimeLeft(TIME_LIMIT);
    setPicked(null);
    setPhase("playing");
  };

  const endGame = (won) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setPhase("result");
    if (won && onWin) onWin(currentStep, TOTAL);
    else if (!won && onLose) onLose(currentStep, TOTAL);
  };

  const handlePick = (partName) => {
    if (picked !== null || endedRef.current) return;
    setPicked(partName);

    const correct = BUILD_ORDER[currentStep].name;
    if (partName === correct) {
      setTimeout(() => {
        if (currentStep + 1 >= TOTAL) {
          endGame(true);
        } else {
          setCurrentStep((s) => s + 1);
          setPicked(null);
        }
      }, 600);
    } else {
      const newLives = lives - 1;
      setLives(newLives);
      setTimeout(() => {
        setPicked(null);
        if (newLives <= 0) {
          endGame(false);
        }
      }, 900);
    }
  };

  if (phase === "intro") {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <Wrench className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mt-4 text-2xl font-black">Engine Builder</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Assemble a Honda engine by tapping parts in the correct build order. Complete all {TOTAL} steps to earn a <span className="font-bold text-primary">free giveaway entry</span>!
        </p>
        <div className="mx-auto mt-5 max-w-xs space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-left text-xs text-muted-foreground">
            <Heart className="h-4 w-4 shrink-0 text-primary" /> {MAX_LIVES} lives — wrong picks cost a life
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-left text-xs text-muted-foreground">
            <Trophy className="h-4 w-4 shrink-0 text-primary" /> {TIME_LIMIT}s time limit
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
          <Play className="h-4 w-4" /> Start Building
        </button>
      </div>
    );
  }

  if (phase === "result") {
    const won = currentStep >= TOTAL - 1 && lives > 0 && timeLeft > 0;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-border bg-card p-8 text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${won ? "bg-primary/15" : "bg-secondary"}`}>
          {won ? <Trophy className="h-8 w-8 text-primary" /> : <RotateCcw className="h-8 w-8 text-muted-foreground" />}
        </div>
        <h2 className="mt-4 text-2xl font-black">{won ? "Engine Built! 🎉" : "Build Failed!"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You completed <span className="font-black text-primary">{won ? TOTAL : currentStep}</span> out of <span className="font-black">{TOTAL}</span> build steps
        </p>
        {won ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary/15 px-4 py-2 text-sm font-bold text-primary">
            <Gift className="h-4 w-4" /> +1 Free Giveaway Entry!
          </div>
        ) : (
          <p className="mx-auto mt-4 max-w-xs text-xs text-muted-foreground">Complete all {TOTAL} steps to earn a free giveaway entry.</p>
        )}
        <button onClick={startGame} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition active:scale-95">
          <RotateCcw className="h-4 w-4" /> Try Again
        </button>
      </motion.div>
    );
  }

  const current = BUILD_ORDER[currentStep];

  return (
    <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <Heart key={i} className={`h-4 w-4 ${i < lives ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-black text-primary">{currentStep + 1} / {TOTAL}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span className={`font-bold ${timeLeft <= 15 ? "text-destructive" : "text-muted-foreground"}`}>{timeLeft}s</span>
        <div className="ml-2 h-1 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className={`h-full transition-all duration-1000 ease-linear ${timeLeft <= 15 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${(timeLeft / TIME_LIMIT) * 100}%` }} />
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Step {currentStep + 1}</p>
        <p className="text-sm font-bold text-foreground">{current.step}</p>
      </div>

      <div className="mt-2 mb-4 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {BUILD_ORDER.map((part, i) => (
          <div
            key={i}
            className={`flex h-7 shrink-0 items-center justify-center rounded-md px-1.5 text-sm transition ${
              i < currentStep
                ? "bg-primary/20 text-primary"
                : i === currentStep
                ? "border border-primary bg-primary/10"
                : "bg-secondary/50 text-muted-foreground/30"
            }`}
          >
            {i < currentStep ? "✓" : i === currentStep ? part.emoji : "🔒"}
          </div>
        ))}
      </div>

      <p className="mb-2 text-center text-xs text-muted-foreground">Tap the correct part to add next</p>

      <div className="grid grid-cols-2 gap-2.5">
        <AnimatePresence>
          {options.map((opt, i) => {
            const isCorrect = opt.name === current.name;
            const showResult = picked !== null;
            const isPicked = picked === opt.name;
            return (
              <motion.button
                key={`${currentStep}-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => handlePick(opt.name)}
                disabled={picked !== null}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 transition-all ${
                  showResult && isCorrect
                    ? "border-primary bg-primary/15 scale-95"
                    : showResult && isPicked && !isCorrect
                    ? "border-destructive bg-destructive/10 scale-95"
                    : "border-border bg-secondary hover:border-primary/50"
                }`}
              >
                <span className="text-3xl">{opt.emoji}</span>
                <span className="text-xs font-bold">{opt.name}</span>
                {showResult && isCorrect && <Check className="absolute h-4 w-4 text-primary" />}
                {showResult && isPicked && !isCorrect && <X className="absolute h-4 w-4 text-destructive" />}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}