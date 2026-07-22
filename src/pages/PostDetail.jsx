import React from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft } from "lucide-react";
import PostCard from "@/components/social/PostCard";
import CommentSection from "@/components/social/CommentSection";

export default function PostDetail() {
  const { id } = useParams();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [me, setMe] = React.useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("social", { action: "listPostDetail", post_id: id });
      if (res.data?.ok) {
        setData(res.data);
      } else if (res.data?.error === "NOT_FOUND") {
        setNotFound(true);
      }
      try { const u = await base44.auth.me(); setMe(u); } catch {}
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, [id]);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>;
  if (notFound || !data) return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link to="/feed" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to feed</Link>
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center"><h3 className="font-bold">Post not found</h3></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link to="/feed" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to feed</Link>
      <PostCard post={data.post} />
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Comments · {data.post.comment_count || 0}</h3>
        <CommentSection
          postId={data.post.id}
          initialComments={data.comments}
          isPostAuthor={data.can_hide_comments}
          isModerator={data.is_moderator}
          currentUserId={me?.id}
        />
      </div>
    </div>
  );
}