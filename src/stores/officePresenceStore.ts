import { create } from 'zustand';
import type { Presence } from '@/components/office/officeAttendance';
/** Local scene presence; never overwrites bridge work or provider-limit status. */
export const useOfficePresenceStore = create<{presence:Presence;setPresence:(presence:Presence)=>void}>(set=>({
  presence:{},setPresence:presence=>set({presence}),
}));
