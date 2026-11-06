import type { ReactNode } from "react";
export type CollectionColumn<Row> = {
  key: string; label: string; headerLabel?: string; width?: number; compactLabel?: string | ((row:Row)=>string); numeric?: boolean; fact?: "suffix" | "prefix" | "bare" | ((row:Row)=>"suffix" | "prefix" | "bare"); introducedVersion?: number;
  render: (row: Row) => ReactNode; compactRender?: (row: Row) => ReactNode; sortValue?: (row: Row) => string | number; sortOnly?: boolean;
};
export type CollectionGroup<Row> = { key: string; label: string; value: (row: Row) => string; order?: (a: string, b: string) => number };
export type BuiltInCollectionView = { label: string; href: string; count?: number; active?: boolean; onSelect?:()=>void };
