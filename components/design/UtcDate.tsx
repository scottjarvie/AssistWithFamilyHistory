const dateFormat = new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
const timeFormat = new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"});
/** Stable across server and browser locales; no hidden timezone conversion. */
export function UtcDate({value,withTime=false}:{value:number;withTime?:boolean}) {
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return <span>Not recorded</span>;
 return <time dateTime={date.toISOString()} title={date.toISOString()}>{(withTime?timeFormat:dateFormat).format(date)}</time>;
}
