import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { GlassPanel } from '@/components/common/GlassPanel';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <GlassPanel>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you are looking for does not exist."
        action={
          <Button asChild variant="outline">
            <Link to="/">Back to overview</Link>
          </Button>
        }
      />
    </GlassPanel>
  );
}
