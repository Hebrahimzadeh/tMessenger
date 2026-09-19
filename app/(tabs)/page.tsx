import { PlatformsList } from '@/components/platforms/PlatformsList';
import { SpaceDiscoveryList } from '@/components/spaces/SpaceDiscoveryList';

export default function HomePage() {
  if (process.env.UI_PREVIEW_MODE === 'true') return <PlatformsList />;

  // Nothing wraps the list: the spaces tab is a chat list, and a chat list
  // has no page heading and no toolbar of its own above it. The header with
  // the tab strip is already the layout's, and creating a space is the
  // floating button in the corner - see ComposeFab.
  return <SpaceDiscoveryList />;
}
