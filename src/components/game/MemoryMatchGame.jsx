import React from "react";
import { motion } from "framer-motion";
import { Play, RotateCcw, Trophy, Gift, Clock, Shuffle } from "lucide-react";
import { getCurrentUser, setCurrentUser } from "@/lib/userIdentity";

const PARTS = [
  { emoji: "🛞", name: "Wheel" },
  { emoji: "⚙️", name: "Gear" },
  { emoji: "🔧", name: "Wrench" },
  { emoji: "🔋", name: "Battery" },
  { emoji: "⛽", name: "Fuel Pump" },
  { emoji: "💨", name: "Turbo" },
  { emoji: "🔌", name: "Spark Plug" },
  { emoji: "🏁", name: "Finish Flag" },
];

const PAIRS = PARTS.length;
const TIME_LIMIT = 60;

function shuffleCards() {
  const cards = [...PARTS, ...PARTS].map((p, i) => ({ ...p, id: i }));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export default function MemoryMatchGame({ onWin, onLose }) {
  const [phase, setPhase] = React.useState("intro");
  const [cards, setCards] = React.useState([]);
  const [flipped, setFlipped] = React.useState([]);
  const [matched, setMatched] = React.useState([]);
  const [moves, setMoves] = React.useState(0);
  const [timeLeft, setTimeLeft] = React.useState(TIME_LIMIT);
  const [name, setName] = React.useState(getCurrentUser() || "");
  const lockRef = React.useRef(false);
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
    if (phase === "playing" && matched.length === PAIRS) {
      endGame(true);
    }
  }, [matched, phase]);

  const startGame = () => {
    if (name) setCurrentUser(name);
    endedRef.current = false;
    setCards(shuffleCards());
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setTimeLeft(TIME_LIMIT);
    lockRef.current = false;
    setPhase("playing");
  };

  const endGame = (won) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setPhase("result");
    const score = won ? PAIRS : matched.length;
    if (won && onWin) onWin(score, PAIRS);
    else if (!won && onLose) onLose(score, PAIRS);
  };

  const flipCard = (index) => {
    if (lockRef.current || endedRef.current) return;
    if (flipped.includes(index)) return;
    if (matched.includes(cards[index].name)) return;
    if (flipped.length >= 2) return;

    const newFlipped = [...flipped, index];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      lockRef.current = true;
      setMoves((m) => m + 1);
      const [a, b] = newFlipped;
      if (cards[a].name === cards[b].name) {
        setTimeout(() => {
          setMatched((prev) => [...prev, cards[a].name]);
          setFlipped([]);
          lockRef.current = false;
        }, 500);
      } else {
        setTimeout(() => {
          setFlipped([]);
          lockRef.current = false;
        }, 900);
      }
    }
  };

  if (phase === "intro") {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <Shuffle className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mt-4 text-2xl font-black">Parts Match</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Find all {PAIRS} matching pairs of Honda parts before time runs out to win a <span className="font-bold text-primary">free giveaway entry</span>!
        </p>
        <div className="mx-auto mt-5 max-w-xs space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-left text-xs text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0 text-primary" /> {TIME_LIMIT} second time limit
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-left text-xs text-muted-foreground">
            <Gift className="h-4 w-4 shrink-0 text-primary" /> Match all {PAIRS} pairs to win
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
    const won = matched.length === PAIRS;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-border bg-card p-8 text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${won ? "bg-primary/15" : "bg-secondary"}`}>
          {won ? <Trophy className="h-8 w-8 text-primary" /> : <RotateCcw className="h-8 w-8 text-muted-foreground" />}
        </div>
        <h2 className="mt-4 text-2xl font-black">{won ? "You Win! 🎉" : "Time's Up!"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You matched <span className="font-black text-primary">{matched.length}</span> out of <span className="font-black">{PAIRS}</span> pairs in <span className="font-black">{moves}</span> moves
        </p>
        {won ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary/15 px-4 py-2 text-sm font-bold text-primary">
            <Gift className="h-4 w-4" /> +1 Free Giveaway Entry!
          </div>
        ) : (
          <p className="mx-auto mt-4 max-w-xs text-xs text-muted-foreground">Match all pairs to earn a free giveaway entry.</p>
        )}
        <button onClick={startGame} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition active:scale-95">
          <RotateCcw className="h-4 w-4" /> Play Again
        </button>
      </motion.div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-muted-foreground">Moves: {moves}</span>
        <span className="font-black text-primary">{matched.length} / {PAIRS} matched</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <Clock className={`h-3.5 w-3.5 ${timeLeft <= 10 ? "text-destructive" : "text-muted-foreground"}`} />
        <span className={timeLeft <= 10 ? "font-bold text-destructive" : "text-muted-foreground"}>{timeLeft}s</span>
        <div className="ml-2 h-1 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className={`h-full transition-all duration-1000 ease-linear ${timeLeft <= 10 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${(timeLeft / TIME_LIMIT) * 100}%` }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2.5">
        {cards.map((card, i) => {
          const isFlipped = flipped.includes(i) || matched.includes(card.name);
          const isMatched = matched.includes(card.name);
          return (
            <button
              key={card.id}
              onClick={() => flipCard(i)}
              disabled={isMatched}
              className={`flex aspect-square items-center justify-center rounded-xl border text-3xl transition-all duration-200 ${
                isMatched
                  ? "border-primary/30 bg-primary/5 opacity-40"
                  : isFlipped
                  ? "border-primary bg-primary/10 scale-95"
                  : "border-border bg-secondary hover:border-primary/50"
              }`}
            >
              {isFlipped ? card.emoji : <span className="text-2xl font-black text-primary/30">H</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}