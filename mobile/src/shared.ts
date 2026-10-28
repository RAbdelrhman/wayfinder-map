// The map logic the desktop app uses, shared with the phone from the repo's src/.
export { parseMapBody, parseBlockedByLine, parseChildNumbers } from '../../src/mapBody';
export { isMapShown, mapVisibility } from '../../src/visibility';
export { criticalPath } from '../../src/criticalPath';
export { assignLayers } from '../../src/layout';
export { ticketStateOf } from '../../src/ticketState';
export { TICKET_TYPES } from '../../src/types';
export type { MapSections, Ticket, TicketState, TicketType } from '../../src/types';
