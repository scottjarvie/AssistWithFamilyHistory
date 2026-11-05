import type { ReactNode } from "react";
export type CollectionColumn<Row> = {
  key: string; label: string; compactLabel?: string; numeric?: boolean; introducedVersion?: number;
  render: (row: Row) => ReactNode; sortValue?: (row: Row) => string | number; sortOnly?: boolean;
};
export type CollectionGroup<Row> = { key: string; label: string; value: (row: Row) => string; order?: (a: string, b: string) => number };
export type BuiltInCollectionView = { label: string; href: string; count?: number; active?: boolean };
