import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons=cronJobs();
crons.interval("expire upload reservations",{minutes:15},internal.usageLimits.expireReservations,{});
export default crons;
