import React from "react";
import { base44 } from "@/api/base44Client";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/userIdentity";
import StoryViewer from "./StoryViewer";

export default function StoriesBar({ onCreatePost }) {
  const [stories, setStories] = React.useState([]);
  const [viewing, setViewing] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef(null);

  const load = () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    base44.entities.Story.list("-created_date", 50).then((all) => {
      setStories(all.filter((s) => new Date(s.created_date) > new Date(cutoff)));
    });
  };
  React.useEffect(load, []);

  const currentUser = getCurrentUser();

  const storyGroups = [];
  const byAuthor = {};
  stories.forEach((s) => {
    if (!byAuthor[s.author_name]) {
      byAuthor[s.author_name] = { author: s.author_name, stories: [] };
      storyGroups.push(byAuthor[s.author_name]);
    }
    byAuthor[s.author_name].stories.push(s);
  });

  const myGroupIndex = storyGroups.findIndex((g) => g.author === currentUser);
  const otherGroups = storyGroups.filter((g, i) => i !== myGroupIndex);
  const orderedGroups = myGroupIndex >= 0 ? [storyGroups[myGroupIndex], ...otherGroups] : storyGroups;

  const isViewed = (group) => group.stories.every((s) => s.views?.includes(currentUser));

  const createStory = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const mediaType = file.type.startsWith("video") ? "video" : "photo";
      await base44.entities.Story.create({ author_name: currentUser || "Anonymous", media_url: file_url, media_type: mediaType, views: [] });
      load();
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto border-b border-border px-3 py-3 scrollbar-hide">
        {/* Your Story */}
        <button onClick={() => (onCreatePost ? onCreatePost() : myGroupIndex >= 0 ? setViewing(myGroupIndex) : fileInputRef.current?.click())} className="flex shrink-0 flex-col items-center gap-1">
          <div className="relative">
            <div className={`rounded-full p-0.5 ${myGroupIndex >= 0 && !isViewed(storyGroups[myGroupIndex]) ? "bg-gradient-to-tr from-primary to-amber-400" : "bg-secondary"}`}>
              <div className="rounded-full border-2 border-background p-0.5">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-bold text-primary">
                  {myGroupIndex >= 0 && storyGroups[myGroupIndex].stories[0]?.media_type === "photo" ? (
                    <img src={storyGroups[myGroupIndex].stories[0].media_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span>{(currentUser || "Y").charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </div>
            </div>
            {myGroupIndex < 0 && (
              <div className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary text-white">
                <Plus className="h-3 w-3" />
              </div>
            )}
          </div>
          <span className="max-w-[64px] truncate text-[10px] text-muted-foreground">Your Story</span>
        </button>

        {/* Other stories */}
        {orderedGroups.filter((g) => g.author !== currentUser).map((g, gi) => {
          const realIdx = storyGroups.indexOf(g);
          const s = g.stories[0];
          const viewed = isViewed(g);
          return (
            <button key={g.author} onClick={() => setViewing(realIdx)} className="flex shrink-0 flex-col items-center gap-1">
              <div className={`rounded-full p-0.5 ${viewed ? "bg-secondary" : "bg-gradient-to-tr from-primary to-amber-400"}`}>
                <div className="rounded-full border-2 border-background p-0.5">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-secondary text-lg font-bold text-primary">
                    {s.media_type === "photo" ? (
                      <img src={s.media_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span>{(g.author || "?").charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                </div>
              </div>
              <span className="max-w-[64px] truncate text-[10px] text-muted-foreground">{g.author}</span>
            </button>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => e.target.files[0] && createStory(e.target.files[0])}
      />

      {uploading && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-primary" /> Uploading story...
        </div>
      )}

      {viewing !== null && (
        <StoryViewer storyGroups={storyGroups} groupIndex={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  );
}