export type FacetDefinition<Row> = {key:string;label:string;options:{value:string;label:string}[];read:(row:Row)=>string;picker?:boolean};

/** Each option's count applies search and every other facet, while ignoring its own current choice. */
export function countCollectionFacets<Row>(rows:Row[],definitions:FacetDefinition<Row>[],values:Record<string,string>,matchesSearch:(row:Row)=>boolean=()=>true) {
  return definitions.map(facet=>({key:facet.key,label:facet.label,picker:facet.picker,count:rows.filter(row=>matchesSearch(row)&&definitions.every(other=>other.key===facet.key||!values[other.key]||other.read(row)===values[other.key])).length,options:facet.options.map(option=>({...option,count:rows.filter(row=>matchesSearch(row)&&definitions.every(other=>other.key===facet.key?other.read(row)===option.value:!values[other.key]||other.read(row)===values[other.key])).length}))}));
}
