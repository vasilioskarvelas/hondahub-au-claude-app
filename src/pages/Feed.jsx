import React from "react";
import { base44 } from "@/api/base44Client";
import { Plus, RefreshCw, Compass, UserCheck, Users } from "lucide-react";
import PostCard from "@/components/social/PostCard";
import CreatePostModal from "@/components/social/CreatePostModal";
import UserSearchBar from "@/components/social/UserSearchBar";
import GroupsList from "@/components/social/GroupsList";

export default function Feed() {
  const [posts, setPosts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [tab, setTab] = React.useState("following");

  const load = async (which = tab) => {
    setLoading(true); setError(null);
    try {
      const action = which === "following" ? "listFeed" : "explore";
      const res = await base44.functions.invoke("social", { action });
      setPosts(res.data?.posts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { if (tab !== "groups") load(tab); }, [tab]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Socials</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => load(tab)} className="rounded-xl border border-border p-2 text-muted-foreground hover:text-foreground"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
            <Plus className="h-4 w-4" /> Post
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        <button onClick={() => setTab("following")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition ${tab === "following" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><UserCheck className="h-4 w-4" /> Following</button>
        <button onClick={() => setTab("explore")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition ${tab === "explore" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><Compass className="h-4 w-4" /> Explore</button>
        <button onClick={() => setTab("groups")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition ${tab === "groups" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><Users className="h-4 w-4" /> Groups</button>
      </div>

      {tab !== "groups" && <UserSearchBar />}

      {tab === "groups" ? (
        <GroupsList />
      ) : loading ? (
        <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <h3 className="font-bold">{tab === "following" ? "Your feed is quiet" : "No posts yet"}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{tab === "following" ? "Follow members to see their posts here, or share the first post." : "Be the first to share something with the community."}</p>
          <button onClick={() => setCreating(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><Plus className="h-4 w-4" /> Create a post</button>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} onLiked={(id, liked, count) => setPosts((arr) => arr.map((x) => x.id === id ? { ...x, liked, like_count: count ?? x.like_count } : x))} />
          ))}
        </div>
      )}

      <CreatePostModal open={creating} onClose={() => setCreating(false)} onCreated={load} />
    </div>
  );
}