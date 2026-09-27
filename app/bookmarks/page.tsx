import { BookmarkedCards } from '@/components/spaces/BookmarkedCards';

// Client-fetched for the same reason the card and space pages are: only the
// browser's own apiFetch call carries the session cookie, and a bookmark list
// is the caller's own by definition - there is nothing here a server render
// without their session could show.
export default function BookmarksPage() {
  return <BookmarkedCards />;
}
