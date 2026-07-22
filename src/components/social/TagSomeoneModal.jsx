import React from "react";
import { base44 } from "@/api/base44Client";
import { X, UserPlus } from "lucide-react";

export default function TagSomeoneModal({ post, onClose, onSaved }) {
  const [tagName, setTagName] = React.useState("");
  const [tags, setTags] = React.useState(post.tags || "");
  const [saving, setSaving] = React.useState(false);

  const tagList = tags ? tags.split(" ").filter(Boolean) : [];

  const addTag = async () => {
    const clean = tagName.trim().replace(/^@/, "");
    if (!clean) return;
    setSaving(true);
    const tag = `@${clean}`;
    let newList = tagList;
    if (!newList.includes(tag)) newList = [...newList, tag];
    const newTags = newList.join(" ");
    await base44.entities.CommunityPost.update(post.id, { tags: newTags });
    setTags(newTags);
    setTagName("");
    setSaving(false);
    onSaved({ ...post, tags: newTags });
  };

  const removeTag = async (tag) => {
    setSaving(true);
    const newList = tagList.filter((t) => t !== tag);
    const newTags = newList.join(" ");
    await base44.entities.CommunityPost.update(post.id, { tags: newTags });
    setTags(newTags);
    setSaving(false);
    onSaved({ ...post, tags: newTags });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-2xl border border-border bg-background sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
          <button onClick={onClose} className="text-primary active:opacity-60">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-bold">Tag People</h2>
          <div className="w-5" />
        </div>

        <div className="p-4 space-y-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
          <div className="flex gap-2">
            <input
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              placeholder="@username"
              autoFocus
              className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={addTag}
              disabled={saving || !tagName.trim()}
              className="flex items-center justify-center rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground active:scale-95 disabled:opacity-40 transition"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </div>

          {tagList.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tagList.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                  {tag}
                  <button onClick={() => removeTag(tag)} disabled={saving} className="text-muted-foreground hover:text-destructive disabled:opacity-40">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Tag people by their @username to mention them in this post.</p>
          )}
        </div>
      </div>
    </div>
  );
}