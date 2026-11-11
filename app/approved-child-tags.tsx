import type {Row} from './cross-types';
export function ApprovedChildTags({row}:{row:Row}){if(!row.approvedChildTypes?.length)return null;return <span className="approved-child-tags" aria-label="已通过子包">{row.approvedChildTypes.map(t=><span key={t.code} className={'approved-child-tag media-'+t.mediaType}><span aria-hidden="true">✓</span> {t.name}</span>)}</span>;}
