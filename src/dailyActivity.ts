export type DailyActivityKind = "gmail"|"outlook"|"recent"|"phone"|"domain"|"usb"|"fire"|"studio"|"folders"|"applications";
export interface DailyActivity {id:string;kind:DailyActivityKind;at:string;summary:string;files?:string[];destination?:string;important?:boolean;}
const eventName="folderrocket:daily-activity";
export function dailyKey(scope:string,date=new Date()){return `folderrocket-daily-job-${scope}-${date.toLocaleDateString('sv-SE')}`;}
export function readDailyActivities(scope:string,date=new Date()):DailyActivity[]{try{const value=JSON.parse(localStorage.getItem(dailyKey(scope,date))||"[]");return Array.isArray(value)?value:[];}catch{return[];}}
export function recordDailyActivity(activity:Omit<DailyActivity,"id"|"at">){window.dispatchEvent(new CustomEvent(eventName,{detail:activity}));}
export function removeDailyActivity(scope:string,id:string,date=new Date()){
 const next=readDailyActivities(scope,date).filter(item=>item.id!==id);
 localStorage.setItem(dailyKey(scope,date),JSON.stringify(next));
 window.dispatchEvent(new CustomEvent(eventName));
 return next;
}
export function listenForDailyActivities(scope:string,onChange:(items:DailyActivity[])=>void){
 const listener=(event:Event)=>{const detail=(event as CustomEvent<Omit<DailyActivity,"id"|"at">>).detail;if(!detail?.kind||!detail.summary)return;const next=[...readDailyActivities(scope),{...detail,id:crypto.randomUUID(),at:new Date().toISOString()}].slice(-600);localStorage.setItem(dailyKey(scope),JSON.stringify(next));onChange(next);};
 window.addEventListener(eventName,listener);return()=>window.removeEventListener(eventName,listener);
}
export function watchDailyActivity(callback:()=>void){const listener=()=>callback();window.addEventListener(eventName,listener);return()=>window.removeEventListener(eventName,listener);}
