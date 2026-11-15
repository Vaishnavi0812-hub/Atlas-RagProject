import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="This page isn’t on the map"
      description="The address you followed doesn’t match any page in ATLAS."
      action={
        <Link to="/">
          <Button variant="dark">Back to overview</Button>
        </Link>
      }
    />
  );
}
