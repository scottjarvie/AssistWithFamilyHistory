import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface VaultStateCardProps {
  title: string;
  description: string;
  badge?: string;
}

export function VaultStateCard({
  title,
  description,
  badge = "Research Vault",
}: VaultStateCardProps) {
  return (
    <Card className="border-dashed border-stone-300 bg-white/85">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">
          {badge}
        </Badge>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
