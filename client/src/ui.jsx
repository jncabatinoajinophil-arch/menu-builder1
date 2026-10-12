export const LABEL = { draft: 'Draft', submitted: 'Submitted', in_progress: 'In progress', completed: 'Completed', needs_changes: 'Needs changes' };
export const STATUSES = Object.keys(LABEL);
export const Badge = ({ s }) => <span className={'badge ' + s}>{LABEL[s]}</span>;
export const when = (d) => new Date(d).toLocaleString();
