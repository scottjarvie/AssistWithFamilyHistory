/** Keep explicit choices, while restoring identity fields moved into columns after an older saved view. */
export function resolveCollectionColumns(columns: {key:string;introducedVersion?:number}[], selected?: string[], version = 1) {
  return columns.filter(column => !selected || selected.includes(column.key) || (column.introducedVersion || 1) > version).map(column => column.key);
}
