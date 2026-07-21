export * from "./generated/api";
export * from "./generated/types";

// For path+query operations orval emits BOTH a zod schema in `api` and a
// same-named TS type in `types` (e.g. GetAccountParams), which makes the two
// wildcard re-exports above ambiguous. The zod schema is the artifact consumers
// use, so give `api` explicit precedence for those names. Add any new colliding
// path+query operation name here after codegen if `tsc` reports TS2308.
export {
  GetAccountParams,
  GetSubscriptionParams,
  CancelSubscriptionParams,
  SkipSubscriptionBody,
  AdminPatchSubscriptionStatusBody,
} from "./generated/api";
