import type {Row} from './cross-types';
export function UrgencyBadge({row}:{row:Row}){return row.urgency?<span className={'cross-urgency '+(row.urgency===2?'urgent':'priority')}>{row.urgency===2?'紧急':'优先'}</span>:null;}
