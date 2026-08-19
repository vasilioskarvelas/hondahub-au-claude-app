import React from "react";
import { base44 } from "@/api/base44Client";
import { Plus, RefreshCw } from "lucide-react";
import PostCard from "@/components/social/PostCard";
import CreatePostModal from "@/components/social/CreatePostModal";
import UserSearchBar from "@/components/social/UserSearchBar";

export default function Feed() {
  const [posts, setPosts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke("social", { action: "listFeed" });
      setPosts(res.data?.posts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Socials</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className="rounded-xl border border-border p-2 text-muted-foreground hover:text-foreground"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
            <Plus className="h-4 w-4" /> Post
          </button>
        </div>
      </div>

      <UserSearchBar />

      {loading ? (
        <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <h3 className="font-bold">Your feed is quiet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Follow members to see their posts here, or share the first post.</p>
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