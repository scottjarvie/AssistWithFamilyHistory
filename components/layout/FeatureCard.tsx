/**
 * FeatureCard Component
 * 
 * Purpose: Card component for displaying features on marketing pages
 * 
 * Key Elements:
 * - Icon display
 * - Title and description
 * - Status badge (available, coming soon)
 * - CTA link
 * 
 * Dependencies:
 * - next/link
 * - @/components/ui/card
 * - @/components/ui/badge
 * - lucide-react icons
 * 
 * Last Updated: Initial setup
 */

import { SafeLink as Link } from "@/components/layout/SafeLink";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, LucideIcon } from "lucide-react";

interface FeatureCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  status: "available" | "coming-soon" | "planned";
  href?: string;
}

export function FeatureCard({ title, description, icon: Icon, status, href }: FeatureCardProps) {
  const isAvailable = status === "available";
  const ctaLabel = href?.startsWith("/features/") ? "Learn More" : "Try Now";
  
  const cardContent = (
    <Card className={`group h-full border-[#c9b7918c] bg-[#fdf9f0cc] py-0 shadow-[0_26px_35px_-34px_#111] backdrop-blur-sm transition-all duration-300 ${
      isAvailable 
        ? "cursor-pointer hover:-translate-y-1 hover:border-[#9f5a2d99] hover:shadow-[0_30px_40px_-30px_#111]"
        : "opacity-80"
    }`}>
      <CardHeader className="gap-4 pt-6">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
            isAvailable ? "border-[#9f5a2d66] bg-[#efe0c5]" : "border-[#b6baa866] bg-[#ece7d8]"
          }`}>
            <Icon className={`w-6 h-6 ${
              isAvailable ? "text-[#9f5a2d]" : "text-[#7f8473]"
            }`} />
          </div>
          <Badge 
            variant={isAvailable ? "default" : "secondary"}
            className={isAvailable ? "border-[#2f6a69] bg-[#2f6a69] text-[#eef5f3] hover:bg-[#2f6a69]" : "border-[#c0c3b5] bg-[#e7e3d5] text-[#5f665f]"}
          >
            {status === "available" && "Available"}
            {status === "coming-soon" && "Coming Soon"}
            {status === "planned" && "Planned"}
          </Badge>
        </div>
        <CardTitle className="text-2xl leading-tight text-[#1d212a]" data-display="true">
          {title}
        </CardTitle>
        <CardDescription className="text-[15px] leading-relaxed text-[#4e5a64]">
          {description}
        </CardDescription>
      </CardHeader>
      {isAvailable && href && (
        <CardContent className="pb-6">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#234d5e]">
            {ctaLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </CardContent>
      )}
    </Card>
  );

  if (isAvailable && href) {
    return <Link href={href}>{cardContent}</Link>;
  }

  return cardContent;
}
