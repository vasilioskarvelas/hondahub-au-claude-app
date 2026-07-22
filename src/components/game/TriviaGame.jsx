import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Clock, Play, RotateCcw, Trophy, Gift } from "lucide-react";
import { getCurrentUser, setCurrentUser } from "@/lib/userIdentity";

const QUESTIONS = [
  {
    q: "What does VTEC stand for?",
    options: ["Variable Valve Timing and Lift Electronic Control", "Variable Turbo Engine Control", "Valve Timing Electronic Control", "Variable Torque Engine Control"],
    correct: 0,
  },
  {
    q: "Which engine is in the Honda S2000 (AP1)?",
    options: ["K20A", "F20C", "B18C", "H22A"],
    correct: 1,
  },
  {
    q: "What chassis code is the Civic Type R (EK9)?",
    options: ["EG6", "EK9", "DC2", "EP3"],
    correct: 1,
  },
  {
    q: "What does JDM stand for?",
    options: ["Japanese Drive Market", "Japanese Domestic Market", "Japan Direct Motor", "Japanese Design Module"],
    correct: 1,
  },
  {
    q: "Which Honda was the first to wear the Type R badge?",
    options: ["Civic Type R", "Integra Type R", "NSX Type R", "Accord Type R"],
    correct: 2,
  },
  {
    q: "What is the redline of a stock S2000 (AP1)?",
    options: ["8,000 RPM", "8,500 RPM", "9,000 RPM", "7,500 RPM"],
    correct: 2,
  },
  {
    q: "Which engine family is in the Integra Type R (DC2)?",
    options: ["K-series", "B-series", "H-series", "F-series"],
    correct: 1,
  },
  {
    q: "What year was the original Honda NSX introduced?",
    options: ["1989", "1990", "1991", "1992"],
    correct: 1,
  },
  {
    q: "Which is considered the 'King of K-series' engines?",
    options: ["K20A", "K24A", "K20Z", "K20C"],
    correct: 0,
  },
  {
    q: "What does LSD stand for in a Honda gearbox?",
    options: ["Limited Slip Differential", "Low Speed Drive", "Locked Steering Differential", "Linear Shift Drive"],
    correct: 0,
  },
];

const TIME_PER_Q = 15;

export default function TriviaGame({ onWin, onLose }) {
  const [phase, setPhase] = React.useState("intro");
  const [qIndex, setQIndex] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [selected, setSelected] = React.useState(null);
  const [revealed, setRevealed] = React.useState(false);
  const [timeLeft, setTimeLeft] = React.useState(TIME_PER_Q);
  const [name, setName] = React.useState(getCurrentUser() || "");

  const question = QUESTIONS[qIndex];

  React.useEffect(() => {
    if (phase !== "playing" || revealed) return;
    if (timeLeft <= 0) {
      setRevealed(true);
      const t = setTimeout(() => nextQuestion(), 1500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, revealed]);

  const startGame = () => {
    if (name) setCurrentUser(name);
    setPhase("playing");
    setQIndex(0);
    setScore(0);
    setSelected(null);
    setRevealed(false);
    setTimeLeft(TIME_PER_Q);
  };

  const selectAnswer = (i) => {
    if (revealed) return;
    setSelected(i);
    setRevealed(true);
    if (i === question.correct) setScore((s) => s + 1);
    setTimeout(() => nextQuestion(), 1500);
  };

  const nextQuestion = () => {
    if (qIndex + 1 >= QUESTIONS.length) {
      const finalScore = score;
      const won = finalScore >= 7;
      setPhase("result");
      if (won && onWin) onWin(finalScore, QUESTIONS.length);
      else if (!won && onLose) onLose(finalScore, QUESTIONS.length);
    } else {
      setQIndex((i) => i + 1);
      setSelected(null);
      setRevealed(false);
      setTimeLeft(TIME_PER_Q);
    }
  };

  if (phase === "intro") {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <Trophy className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mt-4 text-2xl font-black">Honda Trivia Challenge</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Answer {QUESTIONS.length} Honda questions. Score 7 or more to win a <span className="font-bold text-primary">free giveaway entry</span>!
        </p>
        <div className="mx-auto mt-5 max-w-xs space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-left text-xs text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0 text-primary" /> {TIME_PER_Q} seconds per question
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-left text-xs text-muted-foreground">
            <Gift className="h-4 w-4 shrink-0 text-primary" /> Win = 1 free raffle entry
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
          <Play className="h-4 w-4" /> Start Game
        </button>
      </div>
    );
  }

  if (phase === "result") {
    const won = score >= 7;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-border bg-card p-8 text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${won ? "bg-primary/15" : "bg-secondary"}`}>
          {won ? <Trophy className="h-8 w-8 text-primary" /> : <RotateCcw className="h-8 w-8 text-muted-foreground" />}
        </div>
        <h2 className="mt-4 text-2xl font-black">{won ? "You Win! 🎉" : "Better luck next time!"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You scored <span className="font-black text-primary">{score}</span> out of <span className="font-black">{QUESTIONS.length}</span>
        </p>
        {won ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary/15 px-4 py-2 text-sm font-bold text-primary">
            <Gift className="h-4 w-4" /> +1 Free Giveaway Entry!
          </div>
        ) : (
          <p className="mx-auto mt-4 max-w-xs text-xs text-muted-foreground">Score 7+ to earn a free giveaway entry.</p>
        )}
        <button onClick={startGame} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition active:scale-95">
          <RotateCcw className="h-4 w-4" /> Play Again
        </button>
      </motion.div>
    );
  }

  const progress = ((qIndex + (revealed ? 1 : 0)) / QUESTIONS.length) * 100;

  return (
    <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-muted-foreground">Question {qIndex + 1} / {QUESTIONS.length}</span>
        <span className="font-black text-primary">Score: {score}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-xs">
        <Clock className={`h-3.5 w-3.5 ${timeLeft <= 5 ? "text-destructive" : "text-muted-foreground"}`} />
        <span className={timeLeft <= 5 ? "font-bold text-destructive" : "text-muted-foreground"}>{timeLeft}s</span>
        <div className="ml-2 h-1 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className={`h-full transition-all duration-1000 ease-linear ${timeLeft <= 5 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${(timeLeft / TIME_PER_Q) * 100}%` }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={qIndex} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          <h3 className="mt-4 text-lg font-bold leading-snug">{question.q}</h3>
          <div className="mt-4 grid gap-2.5">
            {question.options.map((opt, i) => {
              const isCorrect = i === question.correct;
              const isSelected = i === selected;
              let style = "border-border bg-secondary/50 hover:border-primary/50";
              if (revealed) {
                if (isCorrect) style = "border-primary bg-primary/15";
                else if (isSelected) style = "border-destructive bg-destructive/10";
                else style = "border-border bg-secondary/30 opacity-50";
              }
              return (
                <button
                  key={i}
                  onClick={() => selectAnswer(i)}
                  disabled={revealed}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${style}`}
                >
                  {opt}
                  {revealed && isCorrect && <Check className="h-4 w-4 text-primary" />}
                  {revealed && isSelected && !isCorrect && <X className="h-4 w-4 text-destructive" />}
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}