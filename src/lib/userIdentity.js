export function getCurrentUser() {
  return localStorage.getItem("hh_username") || "";
}

export function setCurrentUser(name) {
  localStorage.setItem("hh_username", name);
}

export function getLikedItems() {
  try { return JSON.parse(localStorage.getItem("hh_liked") || "[]"); } catch { return []; }
}

export function isLiked(id) {
  return getLikedItems().includes(id);
}

export function toggleLiked(id) {
  const liked = getLikedItems();
  const was = liked.includes(id);
  localStorage.setItem("hh_liked", JSON.stringify(was ? liked.filter((x) => x !== id) : [...liked, id]));
  return !was;
}

export function getSavedPosts() {
  try { return JSON.parse(localStorage.getItem("hh_saved") || "[]"); } catch { return []; }
}

export function isSaved(id) {
  return getSavedPosts().includes(id);
}

export function toggleSaved(id) {
  const saved = getSavedPosts();
  const was = saved.includes(id);
  localStorage.setItem("hh_saved", JSON.stringify(was ? saved.filter((x) => x !== id) : [...saved, id]));
  return !was;
}

export function getFollowing() {
  try { return JSON.parse(localStorage.getItem("hh_following") || "[]"); } catch { return []; }
}

export function isFollowing(name) {
  return getFollowing().includes(name);
}

export function toggleFollow(name) {
  const following = getFollowing();
  const was = following.includes(name);
  localStorage.setItem("hh_following", JSON.stringify(was ? following.filter((x) => x !== name) : [...following, name]));
  return !was;
}