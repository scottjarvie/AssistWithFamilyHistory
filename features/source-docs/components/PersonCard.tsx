/**
 * PersonCard Component
 * 
 * Purpose: Display person summary card in the list view
 * 
 * Key Elements:
 * - Person name and dates
 * - Source count
 * - Last updated
 * - Link to person workspace
 * 
 * Dependencies:
 * - @/components/ui/card
 * - next/link
 * 
 * Last Updated: Initial setup
 */

import { SafeLink as Link } from "@/components/layout/SafeLink";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonMetadata } from "@/lib/storage/types";
import { User, Calendar, ArrowRight } from "lucide-react";

interface PersonCardProps {
  person: PersonMetadata;
}

export function PersonCard({ person }: PersonCardProps) {
  const dates: string[] = [];
  if (person.birthDate) dates.push(`b. ${person.birthDate}`);
  if (person.deathDate) dates.push(`d. ${person.deathDate}`);

  const updatedDate = new Date(person.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Link href={`/app/source-docs/${person.familySearchId}`}>
      <Card className="h-full hover:shadow-lg hover:border-amber-300 transition-all cursor-pointer group">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-amber-700" />
            </div>
            <Badge variant="secondary" className="text-xs">
              {person.familySearchId}
            </Badge>
          </div>
          <CardTitle className="text-lg mt-3 group-hover:text-amber-700 transition-colors">
            {person.name || "Unknown Person"}
          </CardTitle>
          {dates.length > 0 && (
            <p className="text-stone-500 text-sm">
              {dates.join(" – ")}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 text-stone-400">
              <Calendar className="w-4 h-4" />
              <span>Updated {updatedDate}</span>
            </div>
            <span className="text-amber-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              View
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
